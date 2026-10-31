package app;
public class RequestContext {
    static final ThreadLocal<String> USER = new ThreadLocal<>();      // violates rule 1
}
