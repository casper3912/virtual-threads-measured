package demo;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringBootVersion;
import org.springframework.core.SpringVersion;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

/**
 * GET /fanout?scenario=...&n=...&factory=...
 * Each of n tasks calls GET /item/{i} then GET /item/{i}/price on the downstream echo server.
 * Every response is checked: did the downstream receive all four inbound headers?
 */
@RestController
public class FanoutController {

    private final RestTemplate restTemplate;
    private final Map<String, RestClient> restClients;
    private final RestClient plainRestClient;
    private final Map<String, Executor> executors;
    private final String downstream;

    public FanoutController(RestTemplate restTemplate, HttpConfig.RestClients restClients,
                            @Qualifier("plainRestClient") RestClient plainRestClient,
                            @Qualifier("bootDefaultLikeExecutor") Executor boot8,
                            @Qualifier("platformExecutor") Executor platform,
                            @Qualifier("platformExecutorNoDecorator") Executor platformNoDec,
                            @Qualifier("virtualExecutor") Executor virtual,
                            @Qualifier("virtualExecutorNoDecorator") Executor virtualNoDec,
                            @Qualifier("virtualExecutorLimited") Executor virtualLimited,
                            @Value("${downstream.url}") String downstream) {
        this.restTemplate = restTemplate;
        this.restClients = restClients.byFactory();
        this.plainRestClient = plainRestClient;
        this.executors = Map.of("boot8", boot8, "pool", platform, "pool-nodec", platformNoDec,
                                "vt", virtual, "vt-nodec", virtualNoDec, "vt-limit", virtualLimited);
        this.downstream = downstream;
    }

    @GetMapping("/fanout")
    public Map<String, Object> fanout(@RequestParam String scenario, @RequestParam int n,
                                      @RequestParam(defaultValue = "hc5-tuned") String factory,
                                      HttpServletRequest inbound) {
        ForwardedHeaders expected = ForwardedHeaders.from(inbound);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("scenario", scenario); out.put("n", n); out.put("calls", 2 * n); out.put("factory", factory);
        out.put("jdk", Runtime.version().feature());
        out.put("boot", SpringBootVersion.getVersion()); out.put("framework", SpringVersion.getVersion());
        long t0 = System.nanoTime();
        try {
            int ok = run(scenario, n, factory, expected);
            out.put("ms", (System.nanoTime() - t0) / 1_000_000);
            out.put("forwarded", ok);
        } catch (Exception e) {
            Throwable root = e; while (root.getCause() != null) root = root.getCause();
            out.put("error", root.getClass().getSimpleName() + ": " + root.getMessage());
        }
        return out;
    }

    private int run(String scenario, int n, String factory, ForwardedHeaders expected) {
        AtomicInteger ok = new AtomicInteger();
        Function<String, String> call;          // path -> response body
        String executorKey;
        switch (scenario) {
            case "rt-loop" -> { call = p -> restTemplate.getForObject(downstream + p, String.class); executorKey = null; }
            case "rt-boot8" -> { call = p -> restTemplate.getForObject(downstream + p, String.class); executorKey = "boot8"; }
            case "rt-pool" -> { call = p -> restTemplate.getForObject(downstream + p, String.class); executorKey = "pool"; }
            case "rt-pool-nodec" -> { call = p -> restTemplate.getForObject(downstream + p, String.class); executorKey = "pool-nodec"; }
            case "rt-vt" -> { call = p -> restTemplate.getForObject(downstream + p, String.class); executorKey = "vt"; }
            case "rc-pool" -> { RestClient c = client(factory); call = p -> c.get().uri(downstream + p).retrieve().body(String.class); executorKey = "pool"; }
            case "rc-vt" -> { RestClient c = client(factory); call = p -> c.get().uri(downstream + p).retrieve().body(String.class); executorKey = "vt"; }
            case "rc-vt-limit" -> { RestClient c = client(factory); call = p -> c.get().uri(downstream + p).retrieve().body(String.class); executorKey = "vt-limit"; }
            case "rc-vt-nodec" -> { RestClient c = client(factory); call = p -> c.get().uri(downstream + p).retrieve().body(String.class); executorKey = "vt-nodec"; }
            case "rc-vt-explicit" -> {
                ForwardedHeaders captured = ForwardedHeaders.current();      // capture on the request thread
                call = p -> plainRestClient.get().uri(downstream + p)
                        .headers(captured::applyTo)                         // pass the value, no ThreadLocal
                        .retrieve().body(String.class);
                executorKey = "vt-nodec";
            }
            default -> throw new IllegalArgumentException("unknown scenario " + scenario);
        }
        if (executorKey == null) {
            for (int i = 0; i < n; i++) ok.addAndGet(task(call, i, expected));
            return ok.get();
        }
        Executor executor = executors.get(executorKey);
        List<CompletableFuture<Void>> all = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            final int k = i;
            all.add(CompletableFuture.runAsync(() -> ok.addAndGet(task(call, k, expected)), executor));
        }
        CompletableFuture.allOf(all.toArray(CompletableFuture[]::new)).join();
        return ok.get();
    }

    private RestClient client(String factory) {
        RestClient c = restClients.get(factory);
        if (c == null) throw new IllegalArgumentException("unknown factory " + factory);
        return c;
    }

    /** One task: two dependent GETs. Returns how many of the two arrived with all headers. */
    private static int task(Function<String, String> call, int i, ForwardedHeaders expected) {
        int ok = 0;
        if (forwarded(call.apply("/item/" + i), expected)) ok++;
        if (forwarded(call.apply("/item/" + i + "/price"), expected)) ok++;
        return ok;
    }

    static boolean forwarded(String body, ForwardedHeaders expected) {
        Map<String, String> v = expected.values();
        return body != null
            && body.contains("rid=" + v.get("X-Request-Id") + "|")
            && body.contains("tenant=" + v.get("X-Tenant-Id") + "|")
            && body.contains("auth=" + v.get("Authorization") + "|")
            && body.contains("tp=" + v.get("traceparent") + "|");
    }
}
