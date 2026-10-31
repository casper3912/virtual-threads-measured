// L11: deterministic guardrails for virtual-thread code, checked with ArchUnit.
import com.tngtech.archunit.core.domain.*; import com.tngtech.archunit.core.importer.*;
import com.tngtech.archunit.lang.*; import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.*;
public class VirtualThreadGuard {
    public static void main(String[] args) {
        JavaClasses classes = new ClassFileImporter().importPath(args[0]);
        ArchRule noThreadLocals = noFields().should().haveRawType(ThreadLocal.class)
            .because("request context should travel in a ScopedValue, not a per-thread map");
        ArchRule noSynchronizedMethods = noMethods().should().haveModifier(JavaModifier.SYNCHRONIZED)
            .because("on JDK 21-23, blocking inside synchronized pins the carrier (drop this rule on 24+)");
        for (ArchRule r : new ArchRule[]{noThreadLocals, noSynchronizedMethods}) {
            EvaluationResult res = r.evaluate(classes);
            System.out.println((res.hasViolation() ? "FAIL " : "PASS ") + res.getFailureReport().getDetails());
        }
    }
}
