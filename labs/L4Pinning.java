// L4: blocking inside synchronized. Run with -Djdk.virtualThreadScheduler.parallelism=1
// JDK 21: the virtual thread pins its carrier, so the 4 sleeps run one after another.
// JDK 24+: JEP 491 lets it unmount, so the sleeps overlap.
import java.time.*; import java.util.concurrent.*;
public class L4Pinning {
    public static void main(String[] args) {
        Instant t0 = Instant.now();
        try (var exec = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < 4; i++) {
                Object lock = new Object();          // a separate lock per task: no contention
                exec.submit(() -> {
                    synchronized (lock) {
                        Thread.sleep(200);           // blocking while holding a monitor
                    }
                    return null;
                });
            }
        }
        System.out.println(Runtime.version().feature() + ": 4 x 200 ms in synchronized took "
            + Duration.between(t0, Instant.now()).toMillis() + " ms");
    }
}
