package demo;

import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.SimpleAsyncTaskExecutor;
import org.springframework.core.task.TaskDecorator;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestTemplate;

import java.net.http.HttpClient;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executor;

@Configuration
public class HttpConfig {

    // ---------------------------------------------------------------- context propagation

    /** Copies the caller's ForwardedHeaders onto the worker thread, and always cleans up. */
    @Bean
    TaskDecorator forwardedHeadersDecorator() {
        return task -> {
            ForwardedHeaders captured = ForwardedHeaders.current();          // runs on the submitting thread
            return () -> {
                ForwardedHeaders previous = ForwardedHeaders.current();
                ForwardedHeaders.set(captured);
                try { task.run(); } finally { ForwardedHeaders.set(previous); } // pooled threads must not keep it
            };
        };
    }

    /** Adds the thread's ForwardedHeaders to every outbound call (RestTemplate and RestClient share this type). */
    @Bean
    ClientHttpRequestInterceptor forwardHeadersInterceptor() {
        return (request, body, execution) -> {
            ForwardedHeaders h = ForwardedHeaders.current();
            if (h != null) h.applyTo(request.getHeaders());
            return execution.execute(request, body);
        };
    }

    // ---------------------------------------------------------------- executor beans

    /** Same shape as Spring Boot's default applicationTaskExecutor: 8 core threads, unbounded queue. */
    @Bean
    ThreadPoolTaskExecutor bootDefaultLikeExecutor(TaskDecorator decorator) {
        return pool("boot8-", 8, decorator);
    }

    @Bean
    ThreadPoolTaskExecutor platformExecutor(TaskDecorator decorator) {
        return pool("plat-", 64, decorator);
    }

    @Bean
    ThreadPoolTaskExecutor platformExecutorNoDecorator() {
        return pool("plat-nodec-", 64, null);
    }

    private static ThreadPoolTaskExecutor pool(String prefix, int size, TaskDecorator decorator) {
        ThreadPoolTaskExecutor e = new ThreadPoolTaskExecutor();
        e.setCorePoolSize(size);
        e.setMaxPoolSize(size);
        e.setQueueCapacity(Integer.MAX_VALUE);
        e.setThreadNamePrefix(prefix);
        if (decorator != null) e.setTaskDecorator(decorator);
        e.initialize();
        return e;
    }

    /** One virtual thread per task (Java 21+). On Java 17 this bean is a placeholder that refuses work. */
    @Bean
    Executor virtualExecutor(TaskDecorator decorator) {
        return virtual("vt-", decorator);
    }

    @Bean
    Executor virtualExecutorNoDecorator() {
        return virtual("vt-nodec-", null);
    }

    /** Virtual threads with at most 200 tasks in flight; extra submissions wait (throttle) instead of failing. */
    @Bean
    Executor virtualExecutorLimited(TaskDecorator decorator) {
        Executor e = virtual("vt-lim-", decorator);
        if (e instanceof SimpleAsyncTaskExecutor s) s.setConcurrencyLimit(200);
        return e;
    }

    private static Executor virtual(String prefix, TaskDecorator decorator) {
        if (Runtime.version().feature() < 21) {
            return task -> { throw new UnsupportedOperationException("virtual threads need Java 21+"); };
        }
        SimpleAsyncTaskExecutor e = new SimpleAsyncTaskExecutor(prefix);
        e.setVirtualThreads(true);
        if (decorator != null) e.setTaskDecorator(decorator);
        return e;
    }

    // ---------------------------------------------------------------- request factories

    /** Apache HttpClient 5 with a pool sized for the fan-out (what you should configure). */
    static ClientHttpRequestFactory hc5Tuned() {
        var cm = PoolingHttpClientConnectionManagerBuilder.create().setMaxConnTotal(1000).setMaxConnPerRoute(1000).build();
        return new HttpComponentsClientHttpRequestFactory(HttpClients.custom().setConnectionManager(cm).build());
    }

    /** Apache HttpClient 5 with Spring's no-arg constructor: HttpClient 5's default pool. */
    static ClientHttpRequestFactory hc5Default() {
        return new HttpComponentsClientHttpRequestFactory();
    }

    /** java.net.http.HttpClient (JDK 11+), no connection-pool cap. */
    static ClientHttpRequestFactory jdk() {
        return new JdkClientHttpRequestFactory(HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build());
    }

    /** HttpURLConnection, what `new RestTemplate()` uses. */
    static ClientHttpRequestFactory simple() {
        return new SimpleClientHttpRequestFactory();
    }

    // ---------------------------------------------------------------- clients

    @Bean
    RestTemplate restTemplate(ClientHttpRequestInterceptor forward) {
        RestTemplate rt = new RestTemplate(hc5Tuned());
        rt.getInterceptors().add(forward);
        return rt;
    }

    /** RestClients keyed by request factory, all with the same forwarding interceptor. */
    record RestClients(Map<String, RestClient> byFactory) {}

    @Bean
    RestClients restClients(ClientHttpRequestInterceptor forward) {
        Map<String, RestClient> m = new LinkedHashMap<>();
        m.put("hc5-tuned", RestClient.builder().requestFactory(hc5Tuned()).requestInterceptor(forward).build());
        m.put("hc5-default", RestClient.builder().requestFactory(hc5Default()).requestInterceptor(forward).build());
        m.put("jdk", RestClient.builder().requestFactory(jdk()).requestInterceptor(forward).build());
        m.put("simple", RestClient.builder().requestFactory(simple()).requestInterceptor(forward).build());
        return new RestClients(m);
    }

    /** RestClient with no interceptor, for the explicit-headers pattern. */
    @Bean
    RestClient plainRestClient() {
        return RestClient.builder().requestFactory(hc5Tuned()).build();
    }
}
