// L12: parallel streams vs Gatherers.mapConcurrent (JDK 24+), and which context survives.
// 200 items, each a 50 ms blocking call that reports the request context it saw.
import java.util.*; import java.util.concurrent.*; import java.util.function.*; import java.util.stream.*;
public class L12MapConcurrent {
    static final ThreadLocal<String> TL = new ThreadLocal<>();
    static final InheritableThreadLocal<String> ITL = new InheritableThreadLocal<>();
    static final ScopedValue<String> SV = ScopedValue.newInstance();
    static String call(int i, String ctx) { try { Thread.sleep(50); } catch (InterruptedException e) { throw new RuntimeException(e); } return ctx; }
    static void report(String name, List<String> seen, long ms) {
        long ok = seen.stream().filter("req-1"::equals).count();
        System.out.printf("%-48s %4d ms   context seen %3d/%d%n", name, ms, ok, seen.size());
    }
    /** Wrap a function so it runs with the caller's ThreadLocal value, restoring the worker's value afterwards. */
    static <T, R> Function<T, R> withContext(Function<T, R> fn) {
        String captured = TL.get();
        return t -> { String prev = TL.get(); TL.set(captured); try { return fn.apply(t); } finally { TL.set(prev); } };
    }
    public static void main(String[] a) throws Exception {
        List<Integer> ids = IntStream.range(0, 200).boxed().toList();
        TL.set("req-1"); ITL.set("req-1");
        long t = System.nanoTime();
        report("parallelStream, ThreadLocal", ids.parallelStream().map(i -> call(i, TL.get())).toList(), (System.nanoTime()-t)/1_000_000);
        t = System.nanoTime();
        report("mapConcurrent(200), ThreadLocal", ids.stream().gather(Gatherers.mapConcurrent(200, i -> call(i, TL.get()))).toList(), (System.nanoTime()-t)/1_000_000);
        t = System.nanoTime();
        report("mapConcurrent(200), InheritableThreadLocal", ids.stream().gather(Gatherers.mapConcurrent(200, i -> call(i, ITL.get()))).toList(), (System.nanoTime()-t)/1_000_000);
        t = System.nanoTime();
        List<String> sv = ScopedValue.where(SV, "req-1").call(() -> ids.stream().gather(Gatherers.mapConcurrent(200, i -> call(i, SV.isBound() ? SV.get() : null))).toList());
        report("mapConcurrent(200), ScopedValue", sv, (System.nanoTime()-t)/1_000_000);
        t = System.nanoTime();
        String ctx = TL.get();
        report("mapConcurrent(200), captured variable", ids.stream().gather(Gatherers.mapConcurrent(200, i -> call(i, ctx))).toList(), (System.nanoTime()-t)/1_000_000);
        t = System.nanoTime();
        report("mapConcurrent(200), withContext(...) wrapper", ids.stream().gather(Gatherers.mapConcurrent(200, withContext(i -> call(i, TL.get())))).toList(), (System.nanoTime()-t)/1_000_000);
        t = System.nanoTime();
        report("mapConcurrent(20), captured variable", ids.stream().gather(Gatherers.mapConcurrent(20, i -> call(i, ctx))).toList(), (System.nanoTime()-t)/1_000_000);
        // order check
        List<Integer> order = ids.stream().gather(Gatherers.mapConcurrent(50, i -> { try { Thread.sleep(ThreadLocalRandom.current().nextInt(20)); } catch (InterruptedException e) {} return i; })).toList();
        System.out.println("mapConcurrent keeps input order: " + order.equals(ids) + "   cores=" + Runtime.getRuntime().availableProcessors());
    }
}
