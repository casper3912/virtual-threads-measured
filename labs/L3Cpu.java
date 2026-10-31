// L3: CPU-bound work gets no speedup from virtual threads (warm up the JIT first).
import java.time.*; import java.util.concurrent.*; import java.util.*;
public class L3Cpu {
    static long burn(long n) { long x = 0; for (long i = 0; i < n; i++) x += (i * 31) ^ (x >>> 3); return x; }
    static long run(ExecutorService exec, int tasks) throws Exception {
        Instant t0 = Instant.now(); List<Future<Long>> fs = new ArrayList<>();
        try (exec) { for (int i = 0; i < tasks; i++) fs.add(exec.submit(() -> burn(50_000_000L))); }
        long sink = 0; for (var f : fs) sink ^= f.get();
        if (sink == 42) System.out.print("");
        return Duration.between(t0, Instant.now()).toMillis();
    }
    public static void main(String[] args) throws Exception {
        int cores = Runtime.getRuntime().availableProcessors(), tasks = cores * 4;
        for (int i = 0; i < 3; i++) run(Executors.newFixedThreadPool(cores), tasks); // warm-up
        System.out.println("cores=" + cores + ", tasks=" + tasks + " (each round, after warm-up)");
        for (int round = 1; round <= 3; round++) {
            long p = run(Executors.newFixedThreadPool(cores), tasks);
            long v = run(Executors.newVirtualThreadPerTaskExecutor(), tasks);
            System.out.printf("round %d: platform pool %4d ms | virtual per task %4d ms%n", round, p, v);
        }
    }
}
