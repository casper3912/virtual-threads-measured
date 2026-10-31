// L1: three ways to start a virtual thread, and what one looks like.
public class L1Hello {
    public static void main(String[] args) throws Exception {
        Thread a = Thread.ofVirtual().name("vt-a").start(() ->
            System.out.println("a: " + Thread.currentThread()));
        Thread b = Thread.startVirtualThread(() ->
            System.out.println("b: isVirtual=" + Thread.currentThread().isVirtual()));
        try (var exec = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
            exec.submit(() -> System.out.println("c: daemon=" + Thread.currentThread().isDaemon()));
        } // close() waits for submitted tasks
        a.join(); b.join();
        System.out.println("main: " + Thread.currentThread() + " isVirtual=" + Thread.currentThread().isVirtual());
    }
}
