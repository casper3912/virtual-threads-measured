// L10: catch pinning with JFR. Records jdk.VirtualThreadPinned while running the L4 workload.
import jdk.jfr.*; import jdk.jfr.consumer.*; import java.nio.file.*; import java.util.concurrent.*;
public class L10Jfr {
    public static void main(String[] args) throws Exception {
        Path file = Files.createTempFile("pin", ".jfr");
        try (var rec = new Recording()) {
            rec.enable("jdk.VirtualThreadPinned").withThreshold(java.time.Duration.ofMillis(20)).withStackTrace();
            rec.start();
            try (var exec = Executors.newVirtualThreadPerTaskExecutor()) {
                for (int i = 0; i < 4; i++) { Object lock = new Object();
                    exec.submit(() -> { synchronized (lock) { Thread.sleep(50); } return null; }); }
            }
            rec.stop(); rec.dump(file);
        }
        var events = RecordingFile.readAllEvents(file);
        System.out.println("JDK " + Runtime.version().feature() + ": jdk.VirtualThreadPinned events = " + events.size());
        events.stream().limit(1).forEach(e -> System.out.println("  duration " + e.getDuration().toMillis()
            + " ms, top frame " + e.getStackTrace().getFrames().get(0).getMethod().getName()));
    }
}
