package demo;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The inbound headers we must forward on every outbound call, captured once as an immutable value.
 * Holding values (not the HttpServletRequest) means a task can never read a recycled request object.
 */
public record ForwardedHeaders(Map<String, String> values) {

    static final List<String> NAMES = List.of("X-Request-Id", "X-Tenant-Id", "Authorization", "traceparent");

    /** Thread-bound copy, filled by {@link CaptureFilter}, copied to worker threads by the TaskDecorator. */
    private static final ThreadLocal<ForwardedHeaders> CURRENT = new ThreadLocal<>();

    static ForwardedHeaders from(HttpServletRequest request) {
        Map<String, String> m = new LinkedHashMap<>();
        for (String name : NAMES) {
            String v = request.getHeader(name);
            if (v != null) m.put(name, v);
        }
        return new ForwardedHeaders(Map.copyOf(m));
    }

    static ForwardedHeaders current() { return CURRENT.get(); }
    static void set(ForwardedHeaders h) { if (h == null) CURRENT.remove(); else CURRENT.set(h); }

    /** Write onto an outbound request. traceparent keeps the trace id; the span id would be new per call in real tracing. */
    void applyTo(HttpHeaders headers) {
        values.forEach(headers::set);
    }

    @Component
    static class CaptureFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
                throws ServletException, IOException {
            set(from(req));
            try { chain.doFilter(req, res); } finally { set(null); }
        }
    }
}
