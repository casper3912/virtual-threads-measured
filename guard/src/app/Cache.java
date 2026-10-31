package app;
public class Cache {
    private final java.util.Map<String,String> m = new java.util.HashMap<>();
    public synchronized String load(String k) throws Exception {       // violates rule 2 (JDK 21 only)
        return m.computeIfAbsent(k, x -> x);
    }
}
