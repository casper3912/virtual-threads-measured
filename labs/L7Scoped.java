// L7: ScopedValue (final in JDK 25, JEP 506) instead of ThreadLocal for request context.
public class L7Scoped {
    static final ScopedValue<String> USER = ScopedValue.newInstance();
    static void handle() { audit(); }
    static void audit() {
        System.out.println("audit: user=" + (USER.isBound() ? USER.get() : "<unbound>")
            + " on " + (Thread.currentThread().isVirtual() ? "virtual" : "platform") + " thread");
    }
    public static void main(String[] args) throws Exception {
        Thread t = Thread.ofVirtual().start(() ->
            ScopedValue.where(USER, "alice").run(L7Scoped::handle));
        t.join();
        audit(); // outside the scope: unbound, nothing to clean up, nothing leaked
    }
}
