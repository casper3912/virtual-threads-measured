// L13: what a blocked virtual thread costs in heap, with a shallow and a deeper stack.
import java.lang.management.*;
import java.util.*;
import java.util.concurrent.*;

public class L13Memory {
    static final CountDownLatch release = new CountDownLatch(1);

    static void park(int depth) {
        if (depth > 0) { park(depth - 1); return; }
        try { release.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }

    static long heapUsed() throws InterruptedException {
        MemoryMXBean m = ManagementFactory.getMemoryMXBean();
        long best = Long.MAX_VALUE;
        for (int i = 0; i < 5; i++) { System.gc(); Thread.sleep(150); best = Math.min(best, m.getHeapMemoryUsage().getUsed()); }
        return best;
    }

    static void trial(int n, int depth) throws Exception {
        long before = heapUsed();
        List<Thread> ts = new ArrayList<>(n);
        CountDownLatch started = new CountDownLatch(n);
        for (int i = 0; i < n; i++) ts.add(Thread.ofVirtual().start(() -> { started.countDown(); park(depth); }));
        started.await();
        Thread.sleep(500);                       // let every thread reach await() and unmount
        long after = heapUsed();
        System.out.printf("%,d virtual threads blocked at stack depth %d: %,d bytes of heap each%n",
                n, depth, (after - before) / n);
        release.countDown();
        for (Thread t : ts) t.join();
    }

    public static void main(String[] args) throws Exception {
        System.out.println("JDK " + Runtime.version().feature());
        // trial 1 releases the shared latch, so each trial runs in its own JVM: pass depth as arg
        int depth = args.length > 0 ? Integer.parseInt(args[0]) : 0;
        trial(100_000, depth);
    }
}
