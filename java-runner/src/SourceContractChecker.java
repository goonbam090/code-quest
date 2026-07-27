import com.sun.source.tree.ArrayAccessTree;
import com.sun.source.tree.ArrayTypeTree;
import com.sun.source.tree.AssignmentTree;
import com.sun.source.tree.BinaryTree;
import com.sun.source.tree.BlockTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.DoWhileLoopTree;
import com.sun.source.tree.ExpressionStatementTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.ForLoopTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.LiteralTree;
import com.sun.source.tree.MemberReferenceTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.NewClassTree;
import com.sun.source.tree.ParenthesizedTree;
import com.sun.source.tree.PrimitiveTypeTree;
import com.sun.source.tree.StatementTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.UnaryTree;
import com.sun.source.tree.VariableTree;
import com.sun.source.tree.WhileLoopTree;
import com.sun.source.util.JavacTask;
import com.sun.source.util.TreePath;
import com.sun.source.util.TreePathScanner;
import com.sun.source.util.Trees;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.lang.model.element.Element;
import javax.lang.model.element.ExecutableElement;
import javax.lang.model.element.Modifier;
import javax.lang.model.element.TypeElement;
import javax.lang.model.type.ArrayType;
import javax.lang.model.type.TypeKind;
import javax.lang.model.type.TypeMirror;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.SimpleJavaFileObject;
import javax.tools.ToolProvider;

public final class SourceContractChecker {
    private static final String SIGNATURE_GUIDANCE =
            "public class Solution 안에 public static int[] solve(int[] numbers) 메서드를 작성해 주세요.";
    private static final String DIRECT_IMPLEMENTATION_GUIDANCE =
            "solve(int[]) 본문의 정상 흐름에서 현재 값을 임시 보관하고, 바로 안쪽 반복문으로 "
                    + "같은 배열의 큰 원소를 오른쪽으로 이동한 뒤 빈 위치에 다시 삽입해 주세요. "
                    + "이 문제의 정렬 반복문은 별도 helper로 위임하지 않습니다.";
    private static final String MEMBER_BADGE_GUIDANCE =
            "MemberBadge의 owner와 grade는 private final 인스턴스 필드로 유지하고, "
                    + "한 인자 생성자의 첫 문장에서 this(owner, \"일반\")로 초기화를 위임해 주세요.";
    private static final String CHECKED_PORT_GUIDANCE =
            "PortValueException은 Exception을 직접 상속하고, "
                    + "ServicePort.parse(String)는 throws PortValueException을 선언해 주세요.";
    private static final Set<String> SORT_METHODS = Set.of("sort", "parallelSort");
    private static final Set<String> ORDERED_CONTAINERS =
            Set.of("java.util.TreeSet", "java.util.PriorityQueue");
    private static final Set<String> SOURCE_CONTRACTS = Set.of(
            "insertion-sort",
            "member-badge-constructor-delegation",
            "checked-port-exception"
    );

    private SourceContractChecker() {}

    public static void main(String[] args) {
        if (args.length != 2) {
            System.out.println("ERROR");
            System.exit(3);
        }
        try {
            String source = Files.readString(Path.of(args[1]), StandardCharsets.UTF_8);
            Result result = check(args[0], source);
            System.out.println(result.matched() ? "PASSED" : "FAILED");
            System.out.println(Base64.getEncoder().encodeToString(
                    result.guidance().getBytes(StandardCharsets.UTF_8)));
            System.exit(result.matched() ? 0 : 2);
        } catch (Exception exception) {
            System.out.println("ERROR");
            System.exit(3);
        }
    }

    static Result check(String sourceContract, String source) {
        if (sourceContract == null || sourceContract.isBlank() || "none".equals(sourceContract)) {
            return Result.passed();
        }
        if (!SOURCE_CONTRACTS.contains(sourceContract)) {
            return new Result(false, "지원하지 않는 소스 코드 계약입니다.");
        }

        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) {
            return new Result(false, "소스 코드 구조 검사기를 사용할 수 없습니다.");
        }
        try {
            JavaFileObject sourceFile = new StringJavaFileObject(source);
            JavacTask task = (JavacTask) compiler.getTask(
                    null, null, null, List.of("-proc:none"), null, List.of(sourceFile));
            List<CompilationUnitTree> units = new ArrayList<>();
            task.parse().forEach(units::add);
            task.analyze();

            if ("member-badge-constructor-delegation".equals(sourceContract)) {
                return matchesMemberBadgeContract(units)
                        ? Result.passed()
                        : new Result(false, MEMBER_BADGE_GUIDANCE);
            }
            if ("checked-port-exception".equals(sourceContract)) {
                return matchesCheckedPortContract(units)
                        ? Result.passed()
                        : new Result(false, CHECKED_PORT_GUIDANCE);
            }

            TargetMethod target = findTargetMethod(units);
            if (target == null) {
                return new Result(false, SIGNATURE_GUIDANCE);
            }

            Trees trees = Trees.instance(task);
            TreePath methodPath = TreePath.getPath(target.unit(), target.method());
            ForbiddenShortcutScanner shortcutScanner = new ForbiddenShortcutScanner(trees);
            shortcutScanner.scan(new TreePath(methodPath, target.method().getBody()), null);
            if (shortcutScanner.forbiddenLibraryShortcut()) {
                return new Result(false,
                        "이 문제에서는 Arrays·Collections·List의 정렬, stream 정렬, "
                                + "TreeSet·PriorityQueue 대신 삽입 이동 과정을 직접 구현해야 합니다.");
            }
            if (shortcutScanner.delegatedArrayHelper()) {
                return new Result(false, DIRECT_IMPLEMENTATION_GUIDANCE);
            }
            if (!DirectInsertionSortMatcher.matches(target.method())) {
                return new Result(false, DIRECT_IMPLEMENTATION_GUIDANCE);
            }
            return Result.passed();
        } catch (IOException | RuntimeException exception) {
            return new Result(false, switch (sourceContract) {
                case "member-badge-constructor-delegation" -> MEMBER_BADGE_GUIDANCE;
                case "checked-port-exception" -> CHECKED_PORT_GUIDANCE;
                default -> "제출 코드의 삽입 정렬 구조를 확인하지 못했습니다.";
            });
        }
    }

    private static boolean matchesMemberBadgeContract(List<CompilationUnitTree> units) {
        ClassTree memberBadge = findClass(units, "MemberBadge");
        if (memberBadge == null
                || !hasPrivateFinalInstanceField(memberBadge, "owner")
                || !hasPrivateFinalInstanceField(memberBadge, "grade")) {
            return false;
        }

        for (Tree member : memberBadge.getMembers()) {
            if (!(member instanceof MethodTree constructor)
                    || constructor.getReturnType() != null
                    || constructor.getParameters().size() != 1
                    || constructor.getBody() == null
                    || constructor.getBody().getStatements().isEmpty()) {
                continue;
            }
            String parameter = constructor.getParameters().getFirst().getName().toString();
            StatementTree first = constructor.getBody().getStatements().getFirst();
            if (!(first instanceof ExpressionStatementTree statement)
                    || !(unwrap(statement.getExpression()) instanceof MethodInvocationTree call)
                    || !(call.getMethodSelect() instanceof IdentifierTree method)
                    || !"this".contentEquals(method.getName())
                    || call.getArguments().size() != 2
                    || !(unwrap(call.getArguments().getFirst()) instanceof IdentifierTree owner)
                    || !parameter.contentEquals(owner.getName())
                    || !(unwrap(call.getArguments().get(1)) instanceof LiteralTree grade)
                    || !"일반".equals(grade.getValue())) {
                continue;
            }
            return true;
        }
        return false;
    }

    private static boolean matchesCheckedPortContract(List<CompilationUnitTree> units) {
        ClassTree exception = findClass(units, "PortValueException");
        ClassTree servicePort = findClass(units, "ServicePort");
        if (exception == null || servicePort == null) return false;
        String superclass = normalizedTree(exception.getExtendsClause());
        if (!"Exception".equals(superclass) && !"java.lang.Exception".equals(superclass)) {
            return false;
        }

        for (Tree member : servicePort.getMembers()) {
            if (!(member instanceof MethodTree method)
                    || !"parse".contentEquals(method.getName())
                    || !method.getModifiers().getFlags().contains(Modifier.STATIC)
                    || !(method.getReturnType() instanceof PrimitiveTypeTree primitive)
                    || primitive.getPrimitiveTypeKind() != TypeKind.INT
                    || method.getParameters().size() != 1
                    || !"String".equals(normalizedTree(method.getParameters().getFirst().getType()))
                    || method.getThrows().stream()
                    .map(SourceContractChecker::normalizedTree)
                    .noneMatch("PortValueException"::equals)) {
                continue;
            }
            return true;
        }
        return false;
    }

    private static ClassTree findClass(
            List<CompilationUnitTree> units, String className) {
        for (CompilationUnitTree unit : units) {
            for (Tree declaration : unit.getTypeDecls()) {
                if (declaration instanceof ClassTree type
                        && type.getKind() == Tree.Kind.CLASS
                        && className.contentEquals(type.getSimpleName())) {
                    return type;
                }
            }
        }
        return null;
    }

    private static boolean hasPrivateFinalInstanceField(ClassTree type, String fieldName) {
        for (Tree member : type.getMembers()) {
            if (!(member instanceof VariableTree field)
                    || !fieldName.contentEquals(field.getName())) {
                continue;
            }
            Set<Modifier> modifiers = field.getModifiers().getFlags();
            return modifiers.contains(Modifier.PRIVATE)
                    && modifiers.contains(Modifier.FINAL)
                    && !modifiers.contains(Modifier.STATIC);
        }
        return false;
    }

    private static TargetMethod findTargetMethod(List<CompilationUnitTree> units) {
        for (CompilationUnitTree unit : units) {
            for (Tree declaration : unit.getTypeDecls()) {
                if (!(declaration instanceof ClassTree type)
                        || type.getKind() != Tree.Kind.CLASS
                        || !"Solution".contentEquals(type.getSimpleName())
                        || !type.getModifiers().getFlags().contains(Modifier.PUBLIC)) {
                    continue;
                }
                for (Tree member : type.getMembers()) {
                    if (member instanceof MethodTree method && hasRequiredSignature(method)) {
                        return new TargetMethod(unit, method);
                    }
                }
            }
        }
        return null;
    }

    private static boolean hasRequiredSignature(MethodTree method) {
        Set<Modifier> modifiers = method.getModifiers().getFlags();
        return "solve".contentEquals(method.getName())
                && modifiers.contains(Modifier.PUBLIC)
                && modifiers.contains(Modifier.STATIC)
                && isIntArray(method.getReturnType())
                && method.getParameters().size() == 1
                && isIntArray(method.getParameters().getFirst().getType())
                && method.getBody() != null;
    }

    private static boolean isIntArray(Tree type) {
        return type instanceof ArrayTypeTree array
                && array.getType() instanceof PrimitiveTypeTree primitive
                && primitive.getPrimitiveTypeKind() == TypeKind.INT;
    }

    private static final class ForbiddenShortcutScanner extends TreePathScanner<Void, Void> {
        private final Trees trees;
        private boolean forbiddenLibraryShortcut;
        private boolean delegatedArrayHelper;

        private ForbiddenShortcutScanner(Trees trees) {
            this.trees = trees;
        }

        boolean forbiddenLibraryShortcut() {
            return forbiddenLibraryShortcut;
        }

        boolean delegatedArrayHelper() {
            return delegatedArrayHelper;
        }

        @Override
        public Void visitMethodInvocation(MethodInvocationTree node, Void unused) {
            ExecutableElement method = executableElement(node.getMethodSelect());
            inspectMethod(method, node.getMethodSelect());
            return super.visitMethodInvocation(node, unused);
        }

        @Override
        public Void visitMemberReference(MemberReferenceTree node, Void unused) {
            ExecutableElement method = executableElement(node);
            inspectMethod(method, node);
            return super.visitMemberReference(node, unused);
        }

        @Override
        public Void visitNewClass(NewClassTree node, Void unused) {
            ExecutableElement constructor = executableElement(node);
            if (constructor != null && ORDERED_CONTAINERS.contains(ownerName(constructor))) {
                forbiddenLibraryShortcut = true;
            }
            return super.visitNewClass(node, unused);
        }

        @Override
        public Void visitClass(ClassTree node, Void unused) {
            delegatedArrayHelper = true;
            return null;
        }

        @Override
        public Void visitLambdaExpression(
                com.sun.source.tree.LambdaExpressionTree node, Void unused) {
            delegatedArrayHelper = true;
            return null;
        }

        private void inspectMethod(ExecutableElement method, Tree syntax) {
            if (method == null) {
                inspectKnownQualifiedSyntax(syntax);
                return;
            }

            String owner = ownerName(method);
            String name = method.getSimpleName().toString();
            if (("java.util.Arrays".equals(owner) && SORT_METHODS.contains(name))
                    || ("java.util.Collections".equals(owner) && "sort".equals(name))
                    || ("java.util.List".equals(owner) && "sort".equals(name))
                    || (owner.startsWith("java.util.stream.") && "sorted".equals(name))) {
                forbiddenLibraryShortcut = true;
                return;
            }
            if (!owner.startsWith("java.") && usesIntArray(method)) {
                delegatedArrayHelper = true;
            }
        }

        private void inspectKnownQualifiedSyntax(Tree syntax) {
            String expression = normalizedTree(syntax);
            if (expression.contains("java.util.Arrays.sort")
                    || expression.contains("java.util.Arrays.parallelSort")
                    || expression.contains("java.util.Collections.sort")
                    || expression.contains("Arrays.sort")
                    || expression.contains("Arrays.parallelSort")
                    || expression.contains("Collections.sort")
                    || expression.contains("TreeSet")
                    || expression.contains("PriorityQueue")) {
                forbiddenLibraryShortcut = true;
            }
        }

        private ExecutableElement executableElement(Tree node) {
            TreePath path = getCurrentPath().getLeaf() == node
                    ? getCurrentPath()
                    : new TreePath(getCurrentPath(), node);
            Element element = trees.getElement(path);
            return element instanceof ExecutableElement executable ? executable : null;
        }

        private String ownerName(ExecutableElement method) {
            Element owner = method.getEnclosingElement();
            return owner instanceof TypeElement type ? type.getQualifiedName().toString() : "";
        }

        private boolean usesIntArray(ExecutableElement method) {
            return isIntArray(method.getReturnType())
                    || method.getParameters().stream()
                    .map(Element::asType)
                    .anyMatch(this::isIntArray);
        }

        private boolean isIntArray(TypeMirror type) {
            return type instanceof ArrayType array
                    && array.getComponentType().getKind() == TypeKind.INT;
        }
    }

    private static final class DirectInsertionSortMatcher {
        private DirectInsertionSortMatcher() {}

        static boolean matches(MethodTree method) {
            for (StatementTree statement : method.getBody().getStatements()) {
                Loop loop = loop(statement);
                if (loop != null
                        && !isObviouslyImpossible(loop.condition())
                        && matchesOuterLoop(loop.body())) {
                    return true;
                }
            }
            return false;
        }

        private static boolean matchesOuterLoop(StatementTree outerBody) {
            if (!(outerBody instanceof BlockTree block)) return false;

            Map<String, String> captures = new LinkedHashMap<>();
            List<? extends StatementTree> statements = block.getStatements();
            for (int index = 0; index < statements.size(); index++) {
                StatementTree statement = statements.get(index);
                Capture capture = capture(statement);
                if (capture != null) {
                    captures.put(capture.variable(), capture.array());
                    continue;
                }

                Loop innerLoop = loop(statement);
                if (innerLoop == null || isObviouslyImpossible(innerLoop.condition())) continue;
                Set<String> shiftedArrays = shiftedArrays(innerLoop.body());
                if (shiftedArrays.isEmpty()) continue;

                for (int following = index + 1; following < statements.size(); following++) {
                    Reinsertion reinsertion = reinsertion(statements.get(following));
                    if (reinsertion == null) continue;
                    String capturedArray = captures.get(reinsertion.variable());
                    if (capturedArray != null
                            && capturedArray.equals(reinsertion.array())
                            && shiftedArrays.contains(capturedArray)) {
                        return true;
                    }
                }
            }
            return false;
        }

        private static Capture capture(StatementTree statement) {
            if (statement instanceof VariableTree variable) {
                ExpressionTree initializer = unwrap(variable.getInitializer());
                if (initializer instanceof ArrayAccessTree access) {
                    return new Capture(
                            variable.getName().toString(),
                            normalizedTree(access.getExpression())
                    );
                }
            }
            AssignmentTree assignment = assignment(statement);
            if (assignment != null
                    && unwrap(assignment.getVariable()) instanceof IdentifierTree variable
                    && unwrap(assignment.getExpression()) instanceof ArrayAccessTree access) {
                return new Capture(
                        variable.getName().toString(),
                        normalizedTree(access.getExpression())
                );
            }
            return null;
        }

        private static Reinsertion reinsertion(StatementTree statement) {
            AssignmentTree assignment = assignment(statement);
            if (assignment != null
                    && unwrap(assignment.getVariable()) instanceof ArrayAccessTree access
                    && unwrap(assignment.getExpression()) instanceof IdentifierTree variable) {
                return new Reinsertion(
                        variable.getName().toString(),
                        normalizedTree(access.getExpression())
                );
            }
            return null;
        }

        private static Set<String> shiftedArrays(StatementTree statement) {
            Set<String> arrays = new LinkedHashSet<>();
            collectReachableShifts(statement, arrays);
            return arrays;
        }

        private static void collectReachableShifts(
                StatementTree statement, Set<String> shiftedArrays) {
            AssignmentTree assignment = assignment(statement);
            if (assignment != null
                    && unwrap(assignment.getVariable()) instanceof ArrayAccessTree left
                    && unwrap(assignment.getExpression()) instanceof ArrayAccessTree right) {
                String leftArray = normalizedTree(left.getExpression());
                String rightArray = normalizedTree(right.getExpression());
                if (leftArray.equals(rightArray)
                        && isOneGreater(left.getIndex(), right.getIndex())) {
                    shiftedArrays.add(leftArray);
                }
                return;
            }
            if (statement instanceof BlockTree block) {
                block.getStatements().forEach(child ->
                        collectReachableShifts(child, shiftedArrays));
            }
        }

        private static AssignmentTree assignment(StatementTree statement) {
            if (statement instanceof ExpressionStatementTree expression
                    && unwrap(expression.getExpression()) instanceof AssignmentTree assignment) {
                return assignment;
            }
            return null;
        }

        private static Loop loop(StatementTree statement) {
            if (statement instanceof ForLoopTree loop) {
                return new Loop(loop.getCondition(), loop.getStatement());
            }
            if (statement instanceof WhileLoopTree loop) {
                return new Loop(loop.getCondition(), loop.getStatement());
            }
            if (statement instanceof DoWhileLoopTree loop) {
                return new Loop(loop.getCondition(), loop.getStatement());
            }
            return null;
        }
    }

    private static boolean isObviouslyImpossible(ExpressionTree expression) {
        ExpressionTree condition = unwrap(expression);
        if (condition == null) return false;
        if (condition instanceof LiteralTree literal
                && Boolean.FALSE.equals(literal.getValue())) {
            return true;
        }
        if (!(condition instanceof BinaryTree binary)) return false;

        return switch (binary.getKind()) {
            case CONDITIONAL_AND ->
                    isObviouslyImpossible(binary.getLeftOperand())
                            || isObviouslyImpossible(binary.getRightOperand());
            case CONDITIONAL_OR ->
                    isObviouslyImpossible(binary.getLeftOperand())
                            && isObviouslyImpossible(binary.getRightOperand());
            case LESS_THAN, LESS_THAN_EQUAL, GREATER_THAN, GREATER_THAN_EQUAL,
                    EQUAL_TO, NOT_EQUAL_TO -> impossibleLengthComparison(binary);
            default -> false;
        };
    }

    private static boolean impossibleLengthComparison(BinaryTree comparison) {
        ExpressionTree left = unwrap(comparison.getLeftOperand());
        ExpressionTree right = unwrap(comparison.getRightOperand());
        if (sameTree(left, right)) {
            return switch (comparison.getKind()) {
                case LESS_THAN, GREATER_THAN, NOT_EQUAL_TO -> true;
                default -> false;
            };
        }

        Long rightNumber = numericLiteral(right);
        if (isLength(left) && rightNumber != null) {
            return switch (comparison.getKind()) {
                case LESS_THAN -> rightNumber <= 0;
                case LESS_THAN_EQUAL, EQUAL_TO -> rightNumber < 0;
                default -> false;
            };
        }
        Long leftNumber = numericLiteral(left);
        if (leftNumber != null && isLength(right)) {
            return switch (comparison.getKind()) {
                case GREATER_THAN -> leftNumber <= 0;
                case GREATER_THAN_EQUAL, EQUAL_TO -> leftNumber < 0;
                default -> false;
            };
        }
        return false;
    }

    private static boolean isLength(ExpressionTree expression) {
        return unwrap(expression) instanceof MemberSelectTree select
                && "length".contentEquals(select.getIdentifier());
    }

    private static Long numericLiteral(ExpressionTree expression) {
        ExpressionTree value = unwrap(expression);
        if (value instanceof LiteralTree literal && literal.getValue() instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof UnaryTree unary
                && unary.getKind() == Tree.Kind.UNARY_MINUS
                && unwrap(unary.getExpression()) instanceof LiteralTree literal
                && literal.getValue() instanceof Number number) {
            return -number.longValue();
        }
        return null;
    }

    private static boolean isOneGreater(ExpressionTree leftIndex, ExpressionTree rightIndex) {
        ExpressionTree left = unwrap(leftIndex);
        ExpressionTree right = unwrap(rightIndex);
        if (left instanceof BinaryTree binary && binary.getKind() == Tree.Kind.PLUS) {
            return (sameTree(binary.getLeftOperand(), right) && isLiteralOne(binary.getRightOperand()))
                    || (isLiteralOne(binary.getLeftOperand()) && sameTree(binary.getRightOperand(), right));
        }
        if (right instanceof BinaryTree binary && binary.getKind() == Tree.Kind.MINUS) {
            return sameTree(binary.getLeftOperand(), left) && isLiteralOne(binary.getRightOperand());
        }
        return false;
    }

    private static boolean isLiteralOne(ExpressionTree expression) {
        ExpressionTree unwrapped = unwrap(expression);
        return unwrapped instanceof LiteralTree literal
                && literal.getValue() instanceof Number number
                && number.longValue() == 1L;
    }

    private static boolean sameTree(Tree first, Tree second) {
        return normalizedTree(first).equals(normalizedTree(second));
    }

    private static String normalizedTree(Tree tree) {
        return tree == null ? "" : tree.toString().replaceAll("\\s+", "");
    }

    private static ExpressionTree unwrap(ExpressionTree expression) {
        ExpressionTree current = expression;
        while (current instanceof ParenthesizedTree parenthesized) {
            current = parenthesized.getExpression();
        }
        return current;
    }

    private static final class StringJavaFileObject extends SimpleJavaFileObject {
        private final String source;

        private StringJavaFileObject(String source) {
            super(URI.create("string:///Solution.java"), JavaFileObject.Kind.SOURCE);
            this.source = source;
        }

        @Override
        public CharSequence getCharContent(boolean ignoreEncodingErrors) {
            return source;
        }
    }

    record Result(boolean matched, String guidance) {
        static Result passed() {
            return new Result(true, "");
        }
    }

    private record TargetMethod(CompilationUnitTree unit, MethodTree method) {}
    private record Loop(ExpressionTree condition, StatementTree body) {}
    private record Capture(String variable, String array) {}
    private record Reinsertion(String variable, String array) {}
}
