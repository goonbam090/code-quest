import com.sun.source.tree.ArrayAccessTree;
import com.sun.source.tree.ArrayTypeTree;
import com.sun.source.tree.AssignmentTree;
import com.sun.source.tree.BinaryTree;
import com.sun.source.tree.BlockTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.ConditionalExpressionTree;
import com.sun.source.tree.DoWhileLoopTree;
import com.sun.source.tree.EnhancedForLoopTree;
import com.sun.source.tree.ExpressionStatementTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.ForLoopTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.IfTree;
import com.sun.source.tree.LiteralTree;
import com.sun.source.tree.MemberReferenceTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.NewClassTree;
import com.sun.source.tree.ParenthesizedTree;
import com.sun.source.tree.PrimitiveTypeTree;
import com.sun.source.tree.ReturnTree;
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
import javax.lang.model.element.ElementKind;
import javax.lang.model.element.ExecutableElement;
import javax.lang.model.element.Modifier;
import javax.lang.model.element.TypeElement;
import javax.lang.model.element.VariableElement;
import javax.lang.model.type.ArrayType;
import javax.lang.model.type.DeclaredType;
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
    private static final String TASK_CHAIN_GUIDANCE =
            "TaskChain은 value와 next를 가진 단일 연결 Node, head와 tail을 유지하고, "
                    + "addLast(String)와 removeFirst()에서 반복문이나 helper 없이 "
                    + "tail.next 연결과 head 이동을 직접 처리해 주세요.";
    private static final String DEQUE_WORKSHOP_GUIDANCE =
            "DequeWorkshop의 reverse와 serve 각각에서 Deque<String>을 "
                    + "새 ArrayDeque<String>으로 만들고, 입력을 넣은 뒤 reverse는 같은 끝에서, "
                    + "serve는 반대쪽 끝에서 꺼내 반환 목록을 직접 구성해 주세요.";
    private static final Set<String> SORT_METHODS = Set.of("sort", "parallelSort");
    private static final Set<String> ORDERED_CONTAINERS =
            Set.of("java.util.TreeSet", "java.util.PriorityQueue");
    private static final Set<String> SOURCE_CONTRACTS = Set.of(
            "insertion-sort",
            "member-badge-constructor-delegation",
            "checked-port-exception",
            "task-chain-linked-queue",
            "deque-workshop-array-deque"
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

            Trees trees = Trees.instance(task);
            if ("task-chain-linked-queue".equals(sourceContract)) {
                return matchesTaskChainContract(units, trees)
                        ? Result.passed()
                        : new Result(false, TASK_CHAIN_GUIDANCE);
            }
            if ("deque-workshop-array-deque".equals(sourceContract)) {
                return matchesDequeWorkshopContract(units, trees)
                        ? Result.passed()
                        : new Result(false, DEQUE_WORKSHOP_GUIDANCE);
            }

            TargetMethod target = findTargetMethod(units);
            if (target == null) {
                return new Result(false, SIGNATURE_GUIDANCE);
            }

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
                case "task-chain-linked-queue" -> TASK_CHAIN_GUIDANCE;
                case "deque-workshop-array-deque" -> DEQUE_WORKSHOP_GUIDANCE;
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

    private static boolean matchesTaskChainContract(
            List<CompilationUnitTree> units, Trees trees) {
        LocatedClass taskChain = findLocatedClass(units, "TaskChain");
        if (taskChain == null) return false;

        TreePath taskChainPath = TreePath.getPath(taskChain.unit(), taskChain.type());
        TypeElement taskChainElement = typeElement(trees, taskChainPath);
        ClassTree node = findNestedClass(taskChain.type(), "Node");
        if (taskChainElement == null || node == null) return false;

        TreePath nodePath = new TreePath(taskChainPath, node);
        TypeElement nodeElement = typeElement(trees, nodePath);
        if (nodeElement == null
                || !node.getModifiers().getFlags().contains(Modifier.STATIC)
                || !node.getModifiers().getFlags().contains(Modifier.FINAL)) {
            return false;
        }

        Map<String, VariableElement> nodeFields = directFields(node, nodePath, trees);
        VariableElement value = nodeFields.get("value");
        VariableElement next = nodeFields.get("next");
        if (nodeFields.size() != 2
                || value == null
                || value.getModifiers().contains(Modifier.STATIC)
                || !value.getModifiers().contains(Modifier.FINAL)
                || !isDeclaredType(value.asType(), "java.lang.String")
                || next == null
                || next.getModifiers().contains(Modifier.STATIC)
                || next.getModifiers().contains(Modifier.FINAL)
                || !isDeclaredType(next.asType(), nodeElement)) {
            return false;
        }

        Map<String, VariableElement> fields = directFields(
                taskChain.type(), taskChainPath, trees);
        VariableElement head = fields.get("head");
        VariableElement tail = fields.get("tail");
        VariableElement size = fields.get("size");
        if (!isInstanceFieldOfType(head, nodeElement)
                || !isInstanceFieldOfType(tail, nodeElement)
                || size == null
                || size.getModifiers().contains(Modifier.STATIC)
                || size.asType().getKind() != TypeKind.INT) {
            return false;
        }
        for (VariableElement field : fields.values()) {
            if (field.equals(head) || field.equals(tail) || field.equals(size)) continue;
            if (!isHarmlessConstant(field)) return false;
        }

        MethodTree addLast = findMethod(
                taskChain.type(), taskChainPath, trees, "addLast",
                TypeKind.VOID, List.of("java.lang.String"), false);
        MethodTree removeFirst = findMethod(
                taskChain.type(), taskChainPath, trees, "removeFirst",
                null, List.of(), false);
        if (addLast == null || removeFirst == null) return false;

        TreePath addLastPath = new TreePath(taskChainPath, addLast);
        ExecutableElement addLastElement = executableElement(trees, addLastPath);
        TreePath removeFirstPath = new TreePath(taskChainPath, removeFirst);
        ExecutableElement removeFirstElement = executableElement(trees, removeFirstPath);
        if (addLastElement == null
                || removeFirstElement == null
                || !isDeclaredType(removeFirstElement.getReturnType(), "java.lang.String")) {
            return false;
        }

        VariableElement input = addLastElement.getParameters().getFirst();
        TaskChainOperationScanner addScanner = new TaskChainOperationScanner(
                trees, nodeElement, input, head, tail, next, true);
        addScanner.scan(new TreePath(addLastPath, addLast.getBody()), null);
        if (!addScanner.matches()) return false;

        TaskChainOperationScanner removeScanner = new TaskChainOperationScanner(
                trees, nodeElement, null, head, tail, next, false);
        removeScanner.scan(new TreePath(removeFirstPath, removeFirst.getBody()), null);
        return removeScanner.matches();
    }

    private static boolean matchesDequeWorkshopContract(
            List<CompilationUnitTree> units, Trees trees) {
        LocatedClass workshop = findLocatedClass(units, "DequeWorkshop");
        if (workshop == null) return false;

        TreePath workshopPath = TreePath.getPath(workshop.unit(), workshop.type());
        MethodTree reverse = findMethod(
                workshop.type(), workshopPath, trees, "reverse",
                null, List.of("java.util.List"), true);
        MethodTree serve = findMethod(
                workshop.type(), workshopPath, trees, "serve",
                null, List.of("java.util.List"), true);
        if (reverse == null || serve == null) return false;

        return matchesDequeMethod(workshopPath, reverse, trees, true)
                && matchesDequeMethod(workshopPath, serve, trees, false);
    }

    private static boolean matchesDequeMethod(
            TreePath ownerPath, MethodTree method, Trees trees, boolean reverse) {
        TreePath methodPath = new TreePath(ownerPath, method);
        ExecutableElement executable = executableElement(trees, methodPath);
        if (executable == null
                || !isStringContainer(executable.getReturnType(), "java.util.List")
                || executable.getParameters().size() != 1
                || !isStringContainer(
                executable.getParameters().getFirst().asType(), "java.util.List")) {
            return false;
        }

        DequeMethodScanner scanner = new DequeMethodScanner(
                trees, executable.getParameters().getFirst());
        scanner.scan(new TreePath(methodPath, method.getBody()), null);
        return scanner.matches(reverse);
    }

    private static LocatedClass findLocatedClass(
            List<CompilationUnitTree> units, String className) {
        for (CompilationUnitTree unit : units) {
            for (Tree declaration : unit.getTypeDecls()) {
                if (declaration instanceof ClassTree type
                        && type.getKind() == Tree.Kind.CLASS
                        && className.contentEquals(type.getSimpleName())) {
                    return new LocatedClass(unit, type);
                }
            }
        }
        return null;
    }

    private static ClassTree findNestedClass(ClassTree owner, String className) {
        for (Tree member : owner.getMembers()) {
            if (member instanceof ClassTree type
                    && type.getKind() == Tree.Kind.CLASS
                    && className.contentEquals(type.getSimpleName())) {
                return type;
            }
        }
        return null;
    }

    private static Map<String, VariableElement> directFields(
            ClassTree owner, TreePath ownerPath, Trees trees) {
        Map<String, VariableElement> fields = new LinkedHashMap<>();
        for (Tree member : owner.getMembers()) {
            if (!(member instanceof VariableTree field)) continue;
            Element element = trees.getElement(new TreePath(ownerPath, field));
            if (element instanceof VariableElement variable) {
                fields.put(field.getName().toString(), variable);
            }
        }
        return fields;
    }

    private static MethodTree findMethod(
            ClassTree owner,
            TreePath ownerPath,
            Trees trees,
            String methodName,
            TypeKind primitiveReturn,
            List<String> parameterTypes,
            boolean requireStatic) {
        for (Tree member : owner.getMembers()) {
            if (!(member instanceof MethodTree method)
                    || !methodName.contentEquals(method.getName())
                    || method.getBody() == null) {
                continue;
            }
            ExecutableElement executable = executableElement(
                    trees, new TreePath(ownerPath, method));
            if (executable == null
                    || executable.getParameters().size() != parameterTypes.size()
                    || executable.getModifiers().contains(Modifier.STATIC) != requireStatic) {
                continue;
            }
            if (primitiveReturn != null
                    && executable.getReturnType().getKind() != primitiveReturn) {
                continue;
            }
            boolean parametersMatch = true;
            for (int index = 0; index < parameterTypes.size(); index++) {
                TypeMirror actual = executable.getParameters().get(index).asType();
                String expected = parameterTypes.get(index);
                if ("java.util.List".equals(expected)
                        ? !isStringContainer(actual, expected)
                        : !isDeclaredType(actual, expected)) {
                    parametersMatch = false;
                    break;
                }
            }
            if (parametersMatch) return method;
        }
        return null;
    }

    private static TypeElement typeElement(Trees trees, TreePath path) {
        Element element = trees.getElement(path);
        return element instanceof TypeElement type ? type : null;
    }

    private static ExecutableElement executableElement(Trees trees, TreePath path) {
        Element element = trees.getElement(path);
        return element instanceof ExecutableElement executable ? executable : null;
    }

    private static boolean isInstanceFieldOfType(
            VariableElement field, TypeElement expectedType) {
        return field != null
                && !field.getModifiers().contains(Modifier.STATIC)
                && isDeclaredType(field.asType(), expectedType);
    }

    private static boolean isHarmlessConstant(VariableElement field) {
        if (!field.getModifiers().contains(Modifier.STATIC)
                || !field.getModifiers().contains(Modifier.FINAL)) {
            return false;
        }
        return field.asType().getKind().isPrimitive()
                || isDeclaredType(field.asType(), "java.lang.String");
    }

    private static boolean isDeclaredType(TypeMirror type, TypeElement expectedType) {
        return type instanceof DeclaredType declared
                && declared.asElement().equals(expectedType);
    }

    private static boolean isDeclaredType(TypeMirror type, String qualifiedName) {
        return type instanceof DeclaredType declared
                && declared.asElement() instanceof TypeElement element
                && qualifiedName.contentEquals(element.getQualifiedName());
    }

    private static boolean isStringContainer(TypeMirror type, String qualifiedName) {
        if (!(type instanceof DeclaredType declared)
                || !(declared.asElement() instanceof TypeElement element)
                || !qualifiedName.contentEquals(element.getQualifiedName())
                || declared.getTypeArguments().size() != 1) {
            return false;
        }
        return isDeclaredType(declared.getTypeArguments().getFirst(), "java.lang.String");
    }

    private static final class TaskChainOperationScanner
            extends TreePathScanner<Void, Void> {
        private final Trees trees;
        private final TypeElement nodeType;
        private final VariableElement input;
        private final VariableElement head;
        private final VariableElement tail;
        private final VariableElement next;
        private final boolean adding;
        private final Map<VariableElement, VariableElement> nodeAliases =
                new LinkedHashMap<>();
        private boolean createsInputNode;
        private boolean writesHead;
        private boolean writesTail;
        private boolean writesTailNext;
        private boolean advancesHead;
        private boolean clearsTail;
        private boolean forbiddenStructure;
        private boolean collectEvidence = true;

        private TaskChainOperationScanner(
                Trees trees,
                TypeElement nodeType,
                VariableElement input,
                VariableElement head,
                VariableElement tail,
                VariableElement next,
                boolean adding) {
            this.trees = trees;
            this.nodeType = nodeType;
            this.input = input;
            this.head = head;
            this.tail = tail;
            this.next = next;
            this.adding = adding;
        }

        boolean matches() {
            if (forbiddenStructure) return false;
            return adding
                    ? createsInputNode && writesHead && writesTail && writesTailNext
                    : advancesHead && clearsTail;
        }

        @Override
        public Void visitVariable(VariableTree node, Void unused) {
            if (collectEvidence) {
                VariableElement variable = variableElement(node);
                VariableElement origin = aliasOrigin(element(node.getInitializer()));
                if (variable != null
                        && variable.getKind() == ElementKind.LOCAL_VARIABLE
                        && isDeclaredType(variable.asType(), nodeType)
                        && origin != null) {
                    nodeAliases.put(variable, origin);
                }
            }
            return super.visitVariable(node, unused);
        }

        @Override
        public Void visitAssignment(AssignmentTree node, Void unused) {
            if (collectEvidence) {
                Element target = element(node.getVariable());
                if (target instanceof VariableElement variable
                        && variable.getKind() == ElementKind.LOCAL_VARIABLE
                        && isDeclaredType(variable.asType(), nodeType)) {
                    VariableElement origin = aliasOrigin(element(node.getExpression()));
                    if (origin == null) {
                        nodeAliases.remove(variable);
                    } else {
                        nodeAliases.put(variable, origin);
                    }
                }
                if (adding) {
                    if (head.equals(target)) writesHead = true;
                    if (tail.equals(target)) writesTail = true;
                    if (next.equals(target)
                            && unwrap(node.getVariable()) instanceof MemberSelectTree select
                            && tail.equals(aliasOrigin(element(select.getExpression())))) {
                        writesTailNext = true;
                    }
                } else {
                    if (head.equals(target)
                            && unwrap(node.getExpression()) instanceof MemberSelectTree select
                            && next.equals(element(select))
                            && head.equals(aliasOrigin(element(select.getExpression())))) {
                        advancesHead = true;
                    }
                    ExpressionTree assigned = unwrap(node.getExpression());
                    if (tail.equals(target)
                            && ((assigned instanceof LiteralTree literal
                            && literal.getValue() == null)
                            || head.equals(aliasOrigin(element(assigned))))) {
                        clearsTail = true;
                    }
                }
            }
            return super.visitAssignment(node, unused);
        }

        @Override
        public Void visitNewClass(NewClassTree node, Void unused) {
            ExecutableElement constructor = executable(node);
            if (collectEvidence
                    && adding
                    && constructor != null
                    && constructor.getEnclosingElement().equals(nodeType)
                    && node.getClassBody() == null
                    && node.getArguments().size() == 1
                    && input.equals(element(node.getArguments().getFirst()))) {
                createsInputNode = true;
            }
            if (node.getClassBody() != null) forbiddenStructure = true;
            return super.visitNewClass(node, unused);
        }

        @Override
        public Void visitIf(IfTree node, Void unused) {
            scan(node.getCondition(), unused);
            if (isObviouslyImpossible(node.getCondition())) {
                scanWithoutEvidence(node.getThenStatement(), unused);
                scan(node.getElseStatement(), unused);
            } else if (isObviouslyTrue(node.getCondition())) {
                scan(node.getThenStatement(), unused);
                scanWithoutEvidence(node.getElseStatement(), unused);
            } else {
                scan(node.getThenStatement(), unused);
                scan(node.getElseStatement(), unused);
            }
            return null;
        }

        @Override
        public Void visitConditionalExpression(
                ConditionalExpressionTree node, Void unused) {
            scan(node.getCondition(), unused);
            if (isObviouslyImpossible(node.getCondition())) {
                scanWithoutEvidence(node.getTrueExpression(), unused);
                scan(node.getFalseExpression(), unused);
            } else if (isObviouslyTrue(node.getCondition())) {
                scan(node.getTrueExpression(), unused);
                scanWithoutEvidence(node.getFalseExpression(), unused);
            } else {
                scan(node.getTrueExpression(), unused);
                scan(node.getFalseExpression(), unused);
            }
            return null;
        }

        @Override
        public Void visitMethodInvocation(MethodInvocationTree node, Void unused) {
            forbiddenStructure = true;
            return null;
        }

        @Override
        public Void visitMemberReference(MemberReferenceTree node, Void unused) {
            forbiddenStructure = true;
            return null;
        }

        @Override
        public Void visitForLoop(ForLoopTree node, Void unused) {
            forbiddenStructure = true;
            return null;
        }

        @Override
        public Void visitEnhancedForLoop(EnhancedForLoopTree node, Void unused) {
            forbiddenStructure = true;
            return null;
        }

        @Override
        public Void visitWhileLoop(WhileLoopTree node, Void unused) {
            forbiddenStructure = true;
            return null;
        }

        @Override
        public Void visitDoWhileLoop(DoWhileLoopTree node, Void unused) {
            forbiddenStructure = true;
            return null;
        }

        @Override
        public Void visitLambdaExpression(
                com.sun.source.tree.LambdaExpressionTree node, Void unused) {
            forbiddenStructure = true;
            return null;
        }

        @Override
        public Void visitClass(ClassTree node, Void unused) {
            forbiddenStructure = true;
            return null;
        }

        private Element element(Tree tree) {
            if (tree == null) return null;
            TreePath path = TreePath.getPath(getCurrentPath(), tree);
            return path == null ? null : trees.getElement(path);
        }

        private VariableElement variableElement(Tree tree) {
            Element element = element(tree);
            return element instanceof VariableElement variable ? variable : null;
        }

        private VariableElement aliasOrigin(Element element) {
            if (!(element instanceof VariableElement variable)) return null;
            if (head.equals(variable) || tail.equals(variable)) return variable;
            return nodeAliases.get(variable);
        }

        private void scanWithoutEvidence(Tree tree, Void unused) {
            boolean previous = collectEvidence;
            collectEvidence = false;
            scan(tree, unused);
            collectEvidence = previous;
        }

        private ExecutableElement executable(Tree tree) {
            Element element = element(tree);
            return element instanceof ExecutableElement executable ? executable : null;
        }
    }

    private static final class DequeMethodScanner extends TreePathScanner<Void, Void> {
        private static final Set<String> DEQUE_TYPES =
                Set.of("java.util.Deque", "java.util.ArrayDeque");
        private final Trees trees;
        private final VariableElement input;
        private final Map<VariableElement, DequeUsage> usages = new LinkedHashMap<>();
        private final Set<VariableElement> activeInputValues = new LinkedHashSet<>();
        private final Map<VariableElement, Removal> removedValues = new LinkedHashMap<>();
        private final Set<VariableElement> returnedVariables = new LinkedHashSet<>();
        private boolean nestedExecutable;

        private DequeMethodScanner(Trees trees, VariableElement input) {
            this.trees = trees;
            this.input = input;
        }

        boolean matches(boolean reverse) {
            if (nestedExecutable) return false;
            for (Map.Entry<VariableElement, DequeUsage> entry : usages.entrySet()) {
                DequeUsage usage = entry.getValue();
                if (usage.inputEnds().size() != 1) continue;
                End inputEnd = usage.inputEnds().iterator().next();
                for (VariableElement returned : returnedVariables) {
                    Set<End> removalEnds = usage.outputEnds().get(returned);
                    if (removalEnds == null || removalEnds.size() != 1) continue;
                    End removalEnd = removalEnds.iterator().next();
                    if (reverse == (inputEnd == removalEnd)) return true;
                }
            }
            return false;
        }

        @Override
        public Void visitVariable(VariableTree node, Void unused) {
            Element declared = element(node);
            if (declared instanceof VariableElement variable
                    && variable.getKind() == ElementKind.LOCAL_VARIABLE
                    && isDequeLocal(variable)
                    && isArrayDequeCreation(node.getInitializer())) {
                registerFreshDeque(variable, node.getInitializer());
            }
            if (declared instanceof VariableElement variable
                    && variable.getKind() == ElementKind.LOCAL_VARIABLE) {
                Removal removal = directRemoval(node.getInitializer());
                if (removal != null) removedValues.put(variable, removal);
            }
            return super.visitVariable(node, unused);
        }

        @Override
        public Void visitAssignment(AssignmentTree node, Void unused) {
            VariableElement target = variableElement(node.getVariable());
            if (target != null && target.getKind() == ElementKind.LOCAL_VARIABLE) {
                invalidateOutputEvidence(target);
            }
            Removal removal = directRemoval(node.getExpression());
            if (target != null && target.getKind() == ElementKind.LOCAL_VARIABLE) {
                if (removal == null) {
                    removedValues.remove(target);
                } else {
                    removedValues.put(target, removal);
                }
            }
            return super.visitAssignment(node, unused);
        }

        @Override
        public Void visitIf(IfTree node, Void unused) {
            scan(node.getCondition(), unused);
            if (isUnreachableCondition(node.getCondition())) {
                scan(node.getElseStatement(), unused);
            } else if (isObviouslyTrue(node.getCondition())) {
                scan(node.getThenStatement(), unused);
            } else {
                scan(node.getThenStatement(), unused);
                scan(node.getElseStatement(), unused);
            }
            return null;
        }

        @Override
        public Void visitConditionalExpression(
                ConditionalExpressionTree node, Void unused) {
            scan(node.getCondition(), unused);
            if (isUnreachableCondition(node.getCondition())) {
                scan(node.getFalseExpression(), unused);
            } else if (isObviouslyTrue(node.getCondition())) {
                scan(node.getTrueExpression(), unused);
            } else {
                scan(node.getTrueExpression(), unused);
                scan(node.getFalseExpression(), unused);
            }
            return null;
        }

        @Override
        public Void visitWhileLoop(WhileLoopTree node, Void unused) {
            scan(node.getCondition(), unused);
            if (!isUnreachableCondition(node.getCondition())) {
                scan(node.getStatement(), unused);
            }
            return null;
        }

        @Override
        public Void visitForLoop(ForLoopTree node, Void unused) {
            for (StatementTree initializer : node.getInitializer()) {
                scan(initializer, unused);
            }
            scan(node.getCondition(), unused);
            if (node.getCondition() == null
                    || !isUnreachableCondition(node.getCondition())) {
                scan(node.getStatement(), unused);
                for (ExpressionStatementTree update : node.getUpdate()) {
                    scan(update, unused);
                }
            }
            return null;
        }

        @Override
        public Void visitEnhancedForLoop(EnhancedForLoopTree node, Void unused) {
            if (input.equals(element(node.getExpression()))) {
                VariableElement loopValue = variableElement(node.getVariable());
                if (loopValue == null) return null;
                activeInputValues.add(loopValue);
                scan(node.getStatement(), unused);
                activeInputValues.remove(loopValue);
                return null;
            }
            return super.visitEnhancedForLoop(node, unused);
        }

        @Override
        public Void visitMethodInvocation(MethodInvocationTree node, Void unused) {
            if (!(node.getMethodSelect() instanceof MemberSelectTree select)) {
                return super.visitMethodInvocation(node, unused);
            }

            VariableElement receiver = variableElement(select.getExpression());
            String methodName = select.getIdentifier().toString();
            if (receiver != null
                    && receiver.getKind() == ElementKind.LOCAL_VARIABLE
                    && "clear".equals(methodName)
                    && node.getArguments().isEmpty()) {
                invalidateOutputEvidence(receiver);
            }
            if (receiver != null && usages.containsKey(receiver)) {
                DequeUsage usage = usages.get(receiver);
                End insertion = insertionEnd(methodName, node.getArguments().size());
                if (insertion != null
                        && node.getArguments().size() == 1
                        && isInputValue(node.getArguments().getFirst())) {
                    usage.inputEnds().add(insertion);
                } else if ("addAll".equals(methodName)
                        && node.getArguments().size() == 1
                        && input.equals(element(node.getArguments().getFirst()))) {
                    usage.inputEnds().add(End.LAST);
                }
            }

            if (receiver != null
                    && receiver.getKind() == ElementKind.LOCAL_VARIABLE
                    && outputInsertion(methodName, node.getArguments().size())) {
                Removal removal = removal(node.getArguments().getFirst());
                if (removal != null) {
                    DequeUsage usage = usages.get(removal.deque());
                    if (usage != null) {
                        usage.outputEnds()
                                .computeIfAbsent(receiver, ignored -> new LinkedHashSet<>())
                                .add(removal.end());
                    }
                }
            }

            if (input.equals(receiver)
                    && "forEach".equals(methodName)
                    && node.getArguments().size() == 1
                    && node.getArguments().getFirst() instanceof MemberReferenceTree reference) {
                VariableElement deque = variableElement(reference.getQualifierExpression());
                End insertion = insertionEnd(reference.getName().toString(), 1);
                if (deque != null && usages.containsKey(deque) && insertion != null) {
                    usages.get(deque).inputEnds().add(insertion);
                }
            }
            return super.visitMethodInvocation(node, unused);
        }

        private void invalidateOutputEvidence(VariableElement result) {
            for (DequeUsage usage : usages.values()) {
                usage.outputEnds().remove(result);
            }
        }

        @Override
        public Void visitReturn(ReturnTree node, Void unused) {
            VariableElement returned = returnedResult(node.getExpression());
            if (returned != null) returnedVariables.add(returned);
            return super.visitReturn(node, unused);
        }

        @Override
        public Void visitLambdaExpression(
                com.sun.source.tree.LambdaExpressionTree node, Void unused) {
            nestedExecutable = true;
            return null;
        }

        @Override
        public Void visitClass(ClassTree node, Void unused) {
            nestedExecutable = true;
            return null;
        }

        @Override
        public Void visitNewClass(NewClassTree node, Void unused) {
            if (node.getClassBody() != null) nestedExecutable = true;
            return super.visitNewClass(node, unused);
        }

        private void registerFreshDeque(VariableElement variable, ExpressionTree initializer) {
            usages.putIfAbsent(variable, new DequeUsage(
                    new LinkedHashSet<>(), new LinkedHashMap<>()));
            NewClassTree creation = newClass(initializer);
            if (creation != null
                    && creation.getArguments().size() == 1
                    && input.equals(element(creation.getArguments().getFirst()))) {
                usages.get(variable).inputEnds().add(End.LAST);
            }
        }

        private boolean isDequeLocal(VariableElement variable) {
            if (!(variable.asType() instanceof DeclaredType declared)
                    || !(declared.asElement() instanceof TypeElement type)
                    || !DEQUE_TYPES.contains(type.getQualifiedName().toString())
                    || declared.getTypeArguments().size() != 1) {
                return false;
            }
            return isDeclaredType(
                    declared.getTypeArguments().getFirst(), "java.lang.String");
        }

        private boolean isArrayDequeCreation(ExpressionTree expression) {
            NewClassTree creation = newClass(expression);
            if (creation == null || creation.getClassBody() != null) return false;
            ExecutableElement constructor = executable(creation);
            return constructor != null
                    && constructor.getEnclosingElement() instanceof TypeElement type
                    && "java.util.ArrayDeque".contentEquals(type.getQualifiedName());
        }

        private NewClassTree newClass(ExpressionTree expression) {
            return unwrap(expression) instanceof NewClassTree creation ? creation : null;
        }

        private boolean isInputValue(ExpressionTree expression) {
            Element direct = element(expression);
            if (direct instanceof VariableElement variable
                    && activeInputValues.contains(variable)) {
                return true;
            }
            ExpressionTree value = unwrap(expression);
            if (!(value instanceof MethodInvocationTree invocation)
                    || !(invocation.getMethodSelect() instanceof MemberSelectTree select)
                    || !"get".contentEquals(select.getIdentifier())
                    || invocation.getArguments().size() != 1) {
                return false;
            }
            return input.equals(element(select.getExpression()));
        }

        private boolean isUnreachableCondition(ExpressionTree expression) {
            if (isObviouslyImpossible(expression)) return true;
            ExpressionTree condition = unwrap(expression);
            if (condition instanceof UnaryTree unary
                    && unary.getKind() == Tree.Kind.LOGICAL_COMPLEMENT) {
                return isAlwaysTrueCondition(unary.getExpression());
            }
            if (!(condition instanceof BinaryTree binary)) return false;
            return switch (binary.getKind()) {
                case CONDITIONAL_AND ->
                        isUnreachableCondition(binary.getLeftOperand())
                                || isUnreachableCondition(binary.getRightOperand());
                case CONDITIONAL_OR ->
                        isUnreachableCondition(binary.getLeftOperand())
                                && isUnreachableCondition(binary.getRightOperand());
                case LESS_THAN, LESS_THAN_EQUAL, GREATER_THAN, GREATER_THAN_EQUAL,
                        EQUAL_TO, NOT_EQUAL_TO -> impossibleInputSizeComparison(binary);
                default -> false;
            };
        }

        private boolean isAlwaysTrueCondition(ExpressionTree expression) {
            if (isObviouslyTrue(expression)) return true;
            ExpressionTree condition = unwrap(expression);
            if (condition instanceof UnaryTree unary
                    && unary.getKind() == Tree.Kind.LOGICAL_COMPLEMENT) {
                return isUnreachableCondition(unary.getExpression());
            }
            if (!(condition instanceof BinaryTree binary)) return false;
            return switch (binary.getKind()) {
                case CONDITIONAL_AND ->
                        isAlwaysTrueCondition(binary.getLeftOperand())
                                && isAlwaysTrueCondition(binary.getRightOperand());
                case CONDITIONAL_OR ->
                        isAlwaysTrueCondition(binary.getLeftOperand())
                                || isAlwaysTrueCondition(binary.getRightOperand());
                case LESS_THAN, LESS_THAN_EQUAL, GREATER_THAN, GREATER_THAN_EQUAL,
                        EQUAL_TO, NOT_EQUAL_TO -> alwaysTrueInputSizeComparison(binary);
                default -> false;
            };
        }

        private boolean impossibleInputSizeComparison(BinaryTree comparison) {
            ExpressionTree left = unwrap(comparison.getLeftOperand());
            ExpressionTree right = unwrap(comparison.getRightOperand());
            Long rightNumber = numericLiteral(right);
            if (isInputSize(left) && rightNumber != null) {
                return switch (comparison.getKind()) {
                    case LESS_THAN -> rightNumber <= 0;
                    case LESS_THAN_EQUAL, EQUAL_TO -> rightNumber < 0;
                    default -> false;
                };
            }
            Long leftNumber = numericLiteral(left);
            if (leftNumber != null && isInputSize(right)) {
                return switch (comparison.getKind()) {
                    case GREATER_THAN -> leftNumber <= 0;
                    case GREATER_THAN_EQUAL, EQUAL_TO -> leftNumber < 0;
                    default -> false;
                };
            }
            return false;
        }

        private boolean alwaysTrueInputSizeComparison(BinaryTree comparison) {
            ExpressionTree left = unwrap(comparison.getLeftOperand());
            ExpressionTree right = unwrap(comparison.getRightOperand());
            Long rightNumber = numericLiteral(right);
            if (isInputSize(left) && rightNumber != null) {
                return switch (comparison.getKind()) {
                    case GREATER_THAN -> rightNumber < 0;
                    case GREATER_THAN_EQUAL -> rightNumber <= 0;
                    case NOT_EQUAL_TO -> rightNumber < 0;
                    default -> false;
                };
            }
            Long leftNumber = numericLiteral(left);
            if (leftNumber != null && isInputSize(right)) {
                return switch (comparison.getKind()) {
                    case LESS_THAN -> leftNumber < 0;
                    case LESS_THAN_EQUAL -> leftNumber <= 0;
                    case NOT_EQUAL_TO -> leftNumber < 0;
                    default -> false;
                };
            }
            return false;
        }

        private boolean isInputSize(ExpressionTree expression) {
            ExpressionTree value = unwrap(expression);
            if (!(value instanceof MethodInvocationTree invocation)
                    || !invocation.getArguments().isEmpty()
                    || !(invocation.getMethodSelect() instanceof MemberSelectTree select)
                    || !input.equals(element(select.getExpression()))) {
                return false;
            }
            ExecutableElement method = executable(invocation);
            if (method == null
                    || !"size".contentEquals(method.getSimpleName())
                    || method.getReturnType().getKind() != TypeKind.INT
                    || !(method.getEnclosingElement() instanceof TypeElement owner)) {
                return false;
            }
            String qualifiedOwner = owner.getQualifiedName().toString();
            return "java.util.Collection".equals(qualifiedOwner)
                    || "java.util.List".equals(qualifiedOwner);
        }

        private Removal directRemoval(ExpressionTree expression) {
            ExpressionTree value = unwrap(expression);
            if (value instanceof MethodInvocationTree invocation
                    && invocation.getMethodSelect() instanceof MemberSelectTree select) {
                VariableElement deque = variableElement(select.getExpression());
                End end = removalEnd(
                        select.getIdentifier().toString(), invocation.getArguments().size());
                if (deque != null && usages.containsKey(deque) && end != null) {
                    return new Removal(deque, end);
                }
            }
            return null;
        }

        private Removal removal(ExpressionTree expression) {
            Removal direct = directRemoval(expression);
            if (direct != null) return direct;
            VariableElement alias = variableElement(unwrap(expression));
            return alias == null ? null : removedValues.get(alias);
        }

        private VariableElement returnedResult(ExpressionTree expression) {
            ExpressionTree returned = unwrap(expression);
            VariableElement direct = variableElement(returned);
            if (direct != null && direct.getKind() == ElementKind.LOCAL_VARIABLE) {
                return direct;
            }
            if (returned instanceof NewClassTree creation
                    && creation.getArguments().size() == 1) {
                ExecutableElement constructor = executable(creation);
                if (constructor != null
                        && constructor.getEnclosingElement() instanceof TypeElement owner
                        && "java.util.ArrayList".contentEquals(owner.getQualifiedName())) {
                    return localVariable(creation.getArguments().getFirst());
                }
            }
            if (!(returned instanceof MethodInvocationTree invocation)
                    || invocation.getArguments().size() != 1) return null;
            ExecutableElement method = executable(invocation);
            if (method == null
                    || !(method.getEnclosingElement() instanceof TypeElement owner)) return null;
            String qualifiedOwner = owner.getQualifiedName().toString();
            String methodName = method.getSimpleName().toString();
            if (!(("java.util.List".equals(qualifiedOwner) && "copyOf".equals(methodName))
                    || ("java.util.Collections".equals(qualifiedOwner)
                    && "unmodifiableList".equals(methodName)))) {
                return null;
            }
            return localVariable(invocation.getArguments().getFirst());
        }

        private VariableElement localVariable(Tree tree) {
            VariableElement variable = variableElement(tree);
            return variable != null && variable.getKind() == ElementKind.LOCAL_VARIABLE
                    ? variable
                    : null;
        }

        private VariableElement variableElement(Tree tree) {
            Element element = element(tree);
            return element instanceof VariableElement variable ? variable : null;
        }

        private Element element(Tree tree) {
            if (tree == null) return null;
            TreePath path = TreePath.getPath(getCurrentPath(), tree);
            return path == null ? null : trees.getElement(path);
        }

        private ExecutableElement executable(Tree tree) {
            Element element = element(tree);
            return element instanceof ExecutableElement executable ? executable : null;
        }

        private static End insertionEnd(String methodName, int arguments) {
            if (arguments != 1) return null;
            return switch (methodName) {
                case "addFirst", "offerFirst", "push" -> End.FIRST;
                case "addLast", "offerLast", "add", "offer" -> End.LAST;
                default -> null;
            };
        }

        private static End removalEnd(String methodName, int arguments) {
            if (arguments != 0) return null;
            return switch (methodName) {
                case "removeFirst", "pollFirst", "remove", "poll", "pop" -> End.FIRST;
                case "removeLast", "pollLast" -> End.LAST;
                default -> null;
            };
        }

        private static boolean outputInsertion(String methodName, int arguments) {
            return arguments == 1
                    && Set.of("add", "addLast", "offer", "offerLast").contains(methodName);
        }
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
        if (condition instanceof UnaryTree unary
                && unary.getKind() == Tree.Kind.LOGICAL_COMPLEMENT) {
            return isObviouslyTrue(unary.getExpression());
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

    private static boolean isObviouslyTrue(ExpressionTree expression) {
        ExpressionTree condition = unwrap(expression);
        if (condition instanceof LiteralTree literal
                && Boolean.TRUE.equals(literal.getValue())) {
            return true;
        }
        return condition instanceof UnaryTree unary
                && unary.getKind() == Tree.Kind.LOGICAL_COMPLEMENT
                && isObviouslyImpossible(unary.getExpression());
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

    private enum End {
        FIRST,
        LAST
    }

    private record LocatedClass(CompilationUnitTree unit, ClassTree type) {}
    private record Removal(VariableElement deque, End end) {}
    private record DequeUsage(
            Set<End> inputEnds,
            Map<VariableElement, Set<End>> outputEnds) {}
    private record TargetMethod(CompilationUnitTree unit, MethodTree method) {}
    private record Loop(ExpressionTree condition, StatementTree body) {}
    private record Capture(String variable, String array) {}
    private record Reinsertion(String variable, String array) {}
}
