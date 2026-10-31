// L5: the JDK 21 fix for L4: ReentrantLock instead of synchronized.
import java.time.*; import java.util.concurrent.*; import java.util.concurrent.locks.*;
public class L5Lock {
    public static void main(String[] args) {
        Instant t0 = Instant.now();
        try (var exec = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < 4; i++) {
                Lock lock = new ReentrantLock();
                exec.submit(() -> {
                    lock.lock();
                    try { Thread.sleep(200); } finally { lock.unlock(); }
                    return null;
                });
            }
        }
        System.out.println(Runtime.version().feature() + ": 4 x 200 ms under ReentrantLock took "
            + Duration.between(t0, Instant.now()).toMillis() + " ms");
    }
}
