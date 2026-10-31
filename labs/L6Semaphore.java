// L6: limit concurrency to a fragile downstream with a Semaphore, not a pool.
import java.time.*; import java.util.concurrent.*; import java.util.concurrent.atomic.*;
public class L6Semaphore {
    static final Semaphore permits = new Semaphore(10);   // downstream allows 10 at once
    static final AtomicInteger inFlight = new AtomicInteger(), peak = new AtomicInteger();
    static String callDownstream(int i) throws InterruptedException {
        permits.acquire();
        try {
            int now = inFlight.incrementAndGet();
            peak.accumulateAndGet(now, Math::max);
            Thread.sleep(50);
            return "ok" + i;
        } finally { inFlight.decrementAndGet(); permits.release(); }
    }
    public static void main(String[] args) {
        Instant t0 = Instant.now();
        try (var exec = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < 200; i++) { int n = i; exec.submit(() -> callDownstream(n)); }
        }
        System.out.println("200 calls, peak concurrency " + peak.get() + ", took "
            + Duration.between(t0, Instant.now()).toMillis() + " ms (floor 200/10 x 50 = 1000 ms)");
    }
}
