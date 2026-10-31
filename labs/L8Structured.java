// L8: structured concurrency (PREVIEW). Compile/run with --enable-preview on the JDK it was written for.
import java.util.concurrent.StructuredTaskScope;
import java.time.*;
public class L8Structured {
    static String user(int id) throws InterruptedException { Thread.sleep(100); return "user" + id; }
    static String orders(int id) throws InterruptedException { Thread.sleep(150); return "3 orders"; }
    static String failing(int id) throws InterruptedException { Thread.sleep(50); throw new IllegalStateException("inventory down"); }

    public static void main(String[] args) throws Exception {
        Instant t0 = Instant.now();
        try (var scope = StructuredTaskScope.open()) {      // default joiner: all succeed or fail fast
            var u = scope.fork(() -> user(42));
            var o = scope.fork(() -> orders(42));
            scope.join();
            System.out.println(u.get() + ", " + o.get() + " in " + Duration.between(t0, Instant.now()).toMillis() + " ms");
        }
        t0 = Instant.now();
        try (var scope = StructuredTaskScope.open()) {
            scope.fork(() -> orders(42));
            scope.fork(() -> failing(42));
            scope.join();
        } catch (StructuredTaskScope.FailedException e) {
            System.out.println("failed fast after " + Duration.between(t0, Instant.now()).toMillis()
                + " ms: " + e.getCause().getMessage() + " (sibling cancelled)");
        }
    }
}
