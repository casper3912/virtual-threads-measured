// GET benchmark, ScopedValue + StructuredTaskScope variant (JDK 25+; StructuredTaskScope is PREVIEW).
// Same workload and checks as GetBench. Compile per JDK with --release <N> --enable-preview.
//
// Usage: java --enable-preview GetBenchScoped <port> <method> <n> <runs>
//   method: sts        - ScopedValue bound once, subtasks forked in a StructuredTaskScope (inherit it)
//           vt-scoped  - ScopedValue bound once, subtasks on a plain virtual-thread executor (do NOT inherit it)
import java.lang.management.*;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

public class GetBenchScoped {
    record Ctx(String requestId, String tenant, String bearer, String traceId) {}

    static final ScopedValue<Ctx> CURRENT = ScopedValue.newInstance();
    static final HttpClient CLIENT = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10)).build();
    static String base;

    static HttpRequest get(int i, String suffix) {
        var b = HttpRequest.newBuilder(URI.create(base + "/item/" + i + suffix)).timeout(Duration.ofSeconds(60)).GET();
        if (CURRENT.isBound()) {                       // read the context where the request is built
            Ctx ctx = CURRENT.get();
            String spanId = String.format("%016x", (long) i * 2 + (suffix.isEmpty() ? 0 : 1) + 1);
            b.header("X-Request-Id", ctx.requestId())
             .header("X-Tenant-Id", ctx.tenant())
             .header("Authorization", "Bearer " + ctx.bearer())
             .header("traceparent", "00-" + ctx.traceId() + "-" + spanId + "-01");
        }
        return b.build();
    }

    static boolean forwarded(String body, Ctx expected) {
        return body.contains("rid=" + expected.requestId() + "|")
            && body.contains("tenant=" + expected.tenant() + "|")
            && body.contains("auth=Bearer " + expected.bearer() + "|")
            && body.contains("tp=00-" + expected.traceId() + "-");
    }

    static String send(HttpRequest r) throws Exception {
        return CLIENT.send(r, HttpResponse.BodyHandlers.ofString()).body();
    }

    static int task(int k, Ctx expected) throws Exception {
        int ok = 0;
        if (forwarded(send(get(k, "")), expected)) ok++;
        if (forwarded(send(get(k, "/price")), expected)) ok++;
        return ok;
    }

    static int run(String method, int n, Ctx inbound) throws Exception {
        return ScopedValue.where(CURRENT, inbound).call(() -> {
            AtomicInteger ok = new AtomicInteger();
            if (method.equals("sts")) {
                try (var scope = StructuredTaskScope.open()) {      // forks inherit CURRENT automatically
                    for (int i = 0; i < n; i++) { final int k = i; scope.fork(() -> ok.addAndGet(task(k, inbound))); }
                    scope.join();                                    // throws if any subtask failed
                }
            } else {
                try (var exec = Executors.newVirtualThreadPerTaskExecutor()) {  // executor threads see nothing
                    for (int i = 0; i < n; i++) { final int k = i; exec.submit(() -> ok.addAndGet(task(k, inbound))); }
                }
            }
            return ok.get();
        });
    }

    public static void main(String[] args) throws Exception {
        base = "http://127.0.0.1:" + args[0];
        String method = args[1]; int n = Integer.parseInt(args[2]); int runs = Integer.parseInt(args[3]);
        Ctx inbound = new Ctx("req-7f3a", "acme", "tok-" + UUID.nameUUIDFromBytes(new byte[]{1}), "4bf92f3577b34da6a3ce929d0e0e4736");
        ThreadMXBean mx = ManagementFactory.getThreadMXBean();
        run(method, Math.min(n, 50), inbound);
        List<Long> times = new ArrayList<>(); int okLast = 0;
        mx.resetPeakThreadCount();
        for (int r = 0; r < runs; r++) {
            long t0 = System.nanoTime();
            okLast = run(method, n, inbound);
            times.add((System.nanoTime() - t0) / 1_000_000);
        }
        List<Long> sorted = new ArrayList<>(times); Collections.sort(sorted);
        System.out.printf("{\"jdk\":%d,\"method\":\"%s\",\"n\":%d,\"calls\":%d,\"mode\":\"scoped\",\"runsMs\":%s,\"medianMs\":%d,"
                + "\"forwarded\":%d,\"peakPlatformThreads\":%d,\"cores\":%d}%n",
            Runtime.version().feature(), method, n, 2 * n, times, sorted.get(sorted.size() / 2),
            okLast, mx.getPeakThreadCount(), Runtime.getRuntime().availableProcessors());
    }
}
