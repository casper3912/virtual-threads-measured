// Local test server: waits LATENCY ms per request (stands in for a real backend),
// then echoes back the headers it received so the client can verify forwarding.
import com.sun.net.httpserver.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

public class EchoServer {
    public static void main(String[] args) throws Exception {
        int port = Integer.parseInt(args[0]);
        long latencyMs = Long.parseLong(args[1]);
        HttpServer server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 8192);
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor()); // server must never be the bottleneck
        server.createContext("/item", ex -> {
            try { Thread.sleep(latencyMs); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            Headers h = ex.getRequestHeaders();
            String body = "rid=" + h.getFirst("X-Request-Id")
                    + "|tenant=" + h.getFirst("X-Tenant-Id")
                    + "|auth=" + h.getFirst("Authorization")
                    + "|tp=" + h.getFirst("traceparent")
                    + "|path=" + ex.getRequestURI().getPath();
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(200, bytes.length);
            try (var out = ex.getResponseBody()) { out.write(bytes); }
        });
        server.start();
        System.out.println("listening on " + port + " with " + latencyMs + " ms latency");
    }
}
