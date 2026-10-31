// GET benchmark: N tasks, each = GET /item/{i} then a dependent GET /item/{i}/price.
// Every outbound call must forward the inbound request's context as headers:
//   X-Request-Id, X-Tenant-Id, Authorization, and a W3C traceparent (same trace, new span per call).
// The server echoes what it received; every response is checked.
//
// Usage: java GetBench <port> <method> <n> <mode> <runs>
//   method: loop | cf-async | cf-pool | cf-common | vt | vt-vtclient | vt-sync
//   mode:   explicit    - capture the context in a local variable before fanning out (correct pattern)
//           threadlocal - read a ThreadLocal wherever the request is built (the common naive pattern)
// Compiled with --release 21 so JDK 21, 25 and 27 run identical bytecode.
import java.lang.management.*;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

public class GetBench {
    /** The inbound request's context: what an incoming HTTP request handed us. */
    record Ctx(String requestId, String tenant, String bearer, String traceId) {}

    static final ThreadLocal<Ctx> CURRENT = new ThreadLocal<>();   // how most code "remembers" the request
    static HttpClient CLIENT;   // built in main; "vt-vtclient" gives the client a virtual-thread executor
    static String base;
    static String mode;

    /** Build an outbound GET that forwards the context. ctx may be null if it was lost. */
    static HttpRequest get(Ctx ctx, int i, String suffix) {
        var b = HttpRequest.newBuilder(URI.create(base + "/item/" + i + suffix))
                .timeout(Duration.ofSeconds(60)).GET();
        if (ctx != null) {
            String spanId = String.format("%016x", (long) i * 2 + (suffix.isEmpty() ? 0 : 1) + 1);
            b.header("X-Request-Id", ctx.requestId())
             .header("X-Tenant-Id", ctx.tenant())
             .header("Authorization", "Bearer " + ctx.bearer())
             .header("traceparent", "00-" + ctx.traceId() + "-" + spanId + "-01");
        }
        return b.build();
    }

    /** Which context does the code at this point see? */
    static Ctx ctx(Ctx captured) { return mode.equals("explicit") ? captured : CURRENT.get(); }

    /** Did the server receive the full context? */
    static boolean forwarded(String body, Ctx expected) {
        return body.contains("rid=" + expected.requestId() + "|")
            && body.contains("tenant=" + expected.tenant() + "|")
            && body.contains("auth=Bearer " + expected.bearer() + "|")
            && body.contains("tp=00-" + expected.traceId() + "-");
    }

    static String send(HttpRequest r) {
        try { return CLIENT.send(r, HttpResponse.BodyHandlers.ofString()).body(); }
        catch (Exception e) { throw new CompletionException(e); }
    }

    /** A legacy wrapper that synchronizes around the blocking call (old SDKs, drivers, caches do this). */
    static final class LegacyClient {
        synchronized String fetch(HttpRequest r) { return send(r); }
    }

    /** One run: returns the number of the 2N calls whose context arrived intact. */
    static int run(String method, int n, Ctx inbound) throws Exception {
        CURRENT.set(inbound);                       // the "request thread" has the context
        Ctx captured = inbound;                     // explicit mode captures it here
        AtomicInteger ok = new AtomicInteger();
        try {
            switch (method) {
                case "loop" -> {
                    for (int i = 0; i < n; i++) {
                        String a = send(get(ctx(captured), i, ""));
                        String b = send(get(ctx(captured), i, "/price"));
                        if (forwarded(a, inbound)) ok.incrementAndGet();
                        if (forwarded(b, inbound)) ok.incrementAndGet();
                    }
                }
                case "cf-async" -> {                // non-blocking HttpClient; second call built in a callback
                    List<CompletableFuture<Void>> all = new ArrayList<>(n);
                    for (int i = 0; i < n; i++) {
                        final int k = i;
                        all.add(CLIENT.sendAsync(get(ctx(captured), k, ""), HttpResponse.BodyHandlers.ofString())
                            .thenCompose(r1 -> {
                                if (forwarded(r1.body(), inbound)) ok.incrementAndGet();
                                return CLIENT.sendAsync(get(ctx(captured), k, "/price"), HttpResponse.BodyHandlers.ofString());
                            })
                            .thenAccept(r2 -> { if (forwarded(r2.body(), inbound)) ok.incrementAndGet(); }));
                    }
                    CompletableFuture.allOf(all.toArray(CompletableFuture[]::new)).join();
                }
                case "cf-pool", "cf-common" -> {    // supplyAsync wrapping blocking calls
                    ExecutorService pool = method.equals("cf-pool") ? Executors.newFixedThreadPool(64) : null;
                    try {
                        List<CompletableFuture<Void>> all = new ArrayList<>(n);
                        for (int i = 0; i < n; i++) {
                            final int k = i;
                            Runnable task = () -> {
                                if (forwarded(send(get(ctx(captured), k, "")), inbound)) ok.incrementAndGet();
                                if (forwarded(send(get(ctx(captured), k, "/price")), inbound)) ok.incrementAndGet();
                            };
                            all.add(pool == null ? CompletableFuture.runAsync(task) : CompletableFuture.runAsync(task, pool));
                        }
                        CompletableFuture.allOf(all.toArray(CompletableFuture[]::new)).join();
                    } finally { if (pool != null) pool.shutdown(); }
                }
                case "vt", "vt-vtclient", "vt-sync" -> {           // one virtual thread per task, plain blocking code
                    try (var exec = Executors.newVirtualThreadPerTaskExecutor()) {
                        for (int i = 0; i < n; i++) {
                            final int k = i;
                            exec.submit(() -> {
                                LegacyClient legacy = method.equals("vt-sync") ? new LegacyClient() : null;
                                String a = legacy == null ? send(get(ctx(captured), k, "")) : legacy.fetch(get(ctx(captured), k, ""));
                                String b = legacy == null ? send(get(ctx(captured), k, "/price")) : legacy.fetch(get(ctx(captured), k, "/price"));
                                if (forwarded(a, inbound)) ok.incrementAndGet();
                                if (forwarded(b, inbound)) ok.incrementAndGet();
                                return null;
                            });
                        }
                    }
                }
                default -> throw new IllegalArgumentException(method);
            }
        } finally { CURRENT.remove(); }
        return ok.get();
    }

    public static void main(String[] args) throws Exception {
        base = "http://127.0.0.1:" + args[0];
        String method = args[1]; int n = Integer.parseInt(args[2]); mode = args[3]; int runs = Integer.parseInt(args[4]);
        var builder = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(10));
        if (method.equals("vt-vtclient")) builder.executor(Executors.newVirtualThreadPerTaskExecutor());
        CLIENT = builder.build();
        Ctx inbound = new Ctx("req-7f3a", "acme", "tok-" + UUID.nameUUIDFromBytes(new byte[]{1}), "4bf92f3577b34da6a3ce929d0e0e4736");
        ThreadMXBean mx = ManagementFactory.getThreadMXBean();

        run(method, Math.min(n, 50), inbound);       // warm-up: JIT, connection pool
        List<Long> times = new ArrayList<>(); int okLast = 0;
        mx.resetPeakThreadCount();
        for (int r = 0; r < runs; r++) {
            long t0 = System.nanoTime();
            okLast = run(method, n, inbound);
            times.add((System.nanoTime() - t0) / 1_000_000);
        }
        List<Long> sorted = new ArrayList<>(times); Collections.sort(sorted);
        System.out.printf("{\"jdk\":%d,\"method\":\"%s\",\"n\":%d,\"calls\":%d,\"mode\":\"%s\",\"runsMs\":%s,\"medianMs\":%d,"
                + "\"forwarded\":%d,\"peakPlatformThreads\":%d,\"cores\":%d}%n",
            Runtime.version().feature(), method, n, 2 * n, mode, times, sorted.get(sorted.size() / 2),
            okLast, mx.getPeakThreadCount(), Runtime.getRuntime().availableProcessors());
    }
}
