// L9: virtual threads appear in jcmd's JSON thread dump (not in jstack-style output by default).
public class L9Dump {
    public static void main(String[] args) throws Exception {
        for (int i = 0; i < 3; i++) Thread.ofVirtual().name("worker-" + i).start(() -> {
            try { Thread.sleep(60_000); } catch (InterruptedException e) {}
        });
        System.out.println("pid " + ProcessHandle.current().pid());
        Thread.sleep(8_000);
    }
}
