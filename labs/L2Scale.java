// L2: 10,000 tasks that each block for 100 ms.
// Platform pool of 200 vs one virtual thread per task.
import java.time.*; import java.util.concurrent.*; import java.util.stream.*;
public class L2Scale {
    static final int TASKS = 10_000;
    static void run(String label, ExecutorService exec) {
        Instant t0 = Instant.now();
        try (exec) {
            IntStream.range(0, TASKS).forEach(i -> exec.submit(() -> {
                Thread.sleep(Duration.ofMillis(100)); // stands in for a blocking DB/HTTP call
                return i;
            }));
        }
        System.out.printf("%-34s %6d ms%n", label, Duration.between(t0, Instant.now()).toMillis());
    }
    public static void main(String[] args) {
        run("fixed pool, 200 platform threads", Executors.newFixedThreadPool(200));
        run("virtual thread per task", Executors.newVirtualThreadPerTaskExecutor());
        System.out.println("Little's law: 10,000 tasks x 0.1 s / 200 threads = 5 s floor for the pool");
    }
}
