import java.math.BigDecimal;
import java.math.MathContext;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;

/**
 * BigDecimal summation: platform threads vs virtual threads vs sequential.
 * Usage: java BigDecimalBench.java [tasks] [numbersPerTask] [runs]
 */
public class BigDecimalBench {
    static final MathContext MC = new MathContext(34);

    public static void main(String[] args) throws Exception {
        int tasks = args.length > 0 ? Integer.parseInt(args[0]) : 10_000;
        int perTask = args.length > 1 ? Integer.parseInt(args[1]) : 1_000;
        int runs = args.length > 2 ? Integer.parseInt(args[2]) : 7;
        int cores = Runtime.getRuntime().availableProcessors();

        BigDecimal[][] inputs = new BigDecimal[tasks][perTask];
        Random r = new Random(42);
        for (int t = 0; t < tasks; t++)
            for (int i = 0; i < perTask; i++)
                inputs[t][i] = BigDecimal.valueOf(r.nextLong(1_000_000_000L), r.nextInt(2, 8));

        System.out.printf("JDK %s | cores=%d | tasks=%d | numbers/task=%d | runs=%d%n%n",
                System.getProperty("java.version"), cores, tasks, perTask, runs);
        System.out.printf("%-34s %10s %10s %10s %12s%n", "strategy", "median ms", "min ms", "max ms", "sums/sec");

        Map<String, Supplier<BigDecimal>> strategies = new LinkedHashMap<>();
        strategies.put("sequential for-loop", () -> sequential(inputs));
        strategies.put("platform fixed pool (cores)", () -> withExecutor(inputs, Executors.newFixedThreadPool(cores)));
        strategies.put("platform fixed pool (cores*4)", () -> withExecutor(inputs, Executors.newFixedThreadPool(cores * 4)));
        strategies.put("platform thread-per-task (cached)", () -> withExecutor(inputs, Executors.newCachedThreadPool()));
        strategies.put("virtual thread-per-task", () -> withExecutor(inputs, Executors.newVirtualThreadPerTaskExecutor()));
        strategies.put("sequential stream", () -> sequentialStream(inputs));
        strategies.put("parallel stream", () -> parallelStream(inputs));

        BigDecimal expected = null;
        for (var e : strategies.entrySet()) {
            for (int i = 0; i < 3; i++) e.getValue().get();
            long[] times = new long[runs];
            BigDecimal result = null;
            for (int i = 0; i < runs; i++) {
                System.gc();
                long t0 = System.nanoTime();
                result = e.getValue().get();
                times[i] = (System.nanoTime() - t0) / 1_000_000;
            }
            if (expected == null) expected = result;
            else if (expected.compareTo(result) != 0) throw new IllegalStateException("Mismatch in " + e.getKey());
            Arrays.sort(times);
            long median = times[runs / 2];
            double sumsPerSec = (double) tasks * perTask / (Math.max(median, 1) / 1000.0);
            System.out.printf("%-34s %10d %10d %10d %12.0f%n", e.getKey(), median, times[0], times[runs - 1], sumsPerSec);
        }
        System.out.println("\nchecksum: " + expected.round(new MathContext(12)));
    }

    static BigDecimal sumOne(BigDecimal[] xs) {
        BigDecimal s = BigDecimal.ZERO;
        for (BigDecimal x : xs) s = s.add(x, MC);
        return s;
    }

    static BigDecimal sequential(BigDecimal[][] inputs) {
        BigDecimal total = BigDecimal.ZERO;
        for (BigDecimal[] xs : inputs) total = total.add(sumOne(xs), MC);
        return total;
    }

    static BigDecimal withExecutor(BigDecimal[][] inputs, ExecutorService ex) {
        try (ex) {
            List<Future<BigDecimal>> fs = new ArrayList<>(inputs.length);
            for (BigDecimal[] xs : inputs) fs.add(ex.submit(() -> sumOne(xs)));
            BigDecimal total = BigDecimal.ZERO;
            for (Future<BigDecimal> f : fs) total = total.add(f.get(), MC);
            return total;
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    static BigDecimal sequentialStream(BigDecimal[][] inputs) {
        return Arrays.stream(inputs).map(BigDecimalBench::sumOne).reduce(BigDecimal.ZERO, (a, b) -> a.add(b, MC));
    }

    static BigDecimal parallelStream(BigDecimal[][] inputs) {
        return Arrays.stream(inputs).parallel().map(BigDecimalBench::sumOne).reduce(BigDecimal.ZERO, (a, b) -> a.add(b, MC));
    }
}
