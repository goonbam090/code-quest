public final class JavaRunnerServerTest {
    private JavaRunnerServerTest() {}

    public static void main(String[] args) throws Exception {
        authenticatesRunnerRequests();
        keepsResourceBudgetsWithinContainerLimit();
        rejectsKnownEscapePaths();
        validatesInsertionSortSourceContract();
        validatesMemberBadgeConstructorDelegationSourceContract();
        validatesCheckedPortExceptionSourceContract();
        validatesTaskChainLinkedQueueSourceContract();
        validatesDequeWorkshopArrayDequeSourceContract();
        enforcesSourceContractInIsolatedHelper();
        runsSafeCodeWithRestrictedPermissions();
        runsHarnessWithoutPrivilegedPermissions();
        System.out.println("Java runner security tests passed.");
    }

    private static void keepsResourceBudgetsWithinContainerLimit() {
        check(JavaRunnerServer.MAX_CONCURRENT_EVALUATIONS == 1,
                "256 MiB 컨테이너에서 compiler JVM을 동시에 실행하도록 설정했습니다.");
        int boundedMemory = JavaRunnerServer.SERVER_PROCESS_BUDGET_MIB
                + JavaRunnerServer.MAX_CHILD_PROCESS_BUDGET_MIB
                + JavaRunnerServer.NATIVE_MEMORY_HEADROOM_MIB;
        check(boundedMemory <= JavaRunnerServer.CONTAINER_MEMORY_MIB,
                "서버·자식 JVM·native headroom 예산이 컨테이너 메모리를 초과합니다.");
        check(JavaRunnerServer.evaluationPhaseBudget().toSeconds() == 14,
                "backend timeout의 기준이 되는 채점 단계 예산이 달라졌습니다.");
    }

    private static void authenticatesRunnerRequests() {
        String token = "0123456789abcdef0123456789abcdef";
        check(token.equals(JavaRunnerServer.requireRunnerToken(token)),
                "유효한 runner token을 거부했습니다.");
        check(JavaRunnerServer.isAuthorized(token, token),
                "동일한 runner token 인증에 실패했습니다.");
        check(!JavaRunnerServer.isAuthorized(token, null),
                "누락된 runner token을 허용했습니다.");
        check(!JavaRunnerServer.isAuthorized(token, "0123456789abcdef0123456789abcdeg"),
                "잘못된 runner token을 허용했습니다.");

        assertInvalidToken(null);
        assertInvalidToken("too-short");
        assertInvalidToken("replace-with-a-long-random-runner-token");
        assertInvalidToken("local-runner-token-change-me-123456789");
    }

    private static void rejectsKnownEscapePaths() {
        assertForbidden("class Solution { Object x = new java.net.Socket(); }");
        assertForbidden("class Solution { Object x = Class.forName(\"java.lang.Runtime\"); }");
        assertForbidden("class Solution { String x = System.getenv(\"PATH\"); }");
        assertForbidden("class Solution { void x() { new /* split */ Thread().start(); } }");
        assertForbidden("class Solution { Object x = java\\u002enet.Socket.class; }");
        assertForbidden("class Solution { Object x = new ProcessBuilder(\"sh\"); }");
        assertForbidden("class Solution { void x() { System.setSecurityManager(null); } }");
        assertForbidden("class Solution { Object x = sun.misc.Unsafe.getUnsafe(); }");
        assertForbidden("class Solution { Object x = javax.tools.ToolProvider.getSystemJavaCompiler(); }");

        String safe = """
                import java.util.*;
                public class Solution {
                    static int solve(List<Integer> values) {
                        return values.stream().mapToInt(Integer::intValue).sum();
                    }
                }
                """;
        check(!JavaRunnerServer.isForbiddenSource(safe), "기본 java.util 코드를 차단했습니다.");
    }

    private static void validatesInsertionSortSourceContract() {
        assertInsertionContractAccepted("""
                public class Solution {
                    public static int[] solve(int[] numbers) {
                        int[] sorted = numbers.clone();
                        for (int index = 1; index < sorted.length; index++) {
                            int current = sorted[index];
                            int position = index - 1;
                            while (position >= 0 && sorted[position] > current) {
                                sorted[position + 1] = sorted[position];
                                position--;
                            }
                            sorted[position + 1] = current;
                        }
                        return sorted;
                    }
                }
                """);
        assertInsertionContractAccepted("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        int[] work = input.clone();
                        int boundary = 1;
                        while (boundary < work.length) {
                            int held = work[boundary];
                            int slot = boundary;
                            for (; slot > 0 && work[slot - 1] > held; slot--) {
                                work[slot] = work[slot - 1];
                            }
                            work[slot] = held;
                            boundary++;
                        }
                        return work;
                    }
                }
                """);
        assertInsertionContractAccepted("""
                public class Solution {
                    private static int sort(int value) {
                        return value;
                    }

                    public static int[] solve(int[] input) {
                        int[] work = input.clone();
                        int ignored = sort(0);
                        for (int boundary = 1; boundary < work.length; boundary++) {
                            int held = work[boundary];
                            int slot = boundary;
                            while (slot > 0 && work[slot - 1] > held) {
                                work[slot] = work[slot - 1];
                                slot--;
                            }
                            work[slot] = held;
                        }
                        return work;
                    }
                }
                """);

        assertLibraryShortcutRejected("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        int[] copy = input.clone();
                        java.util.Arrays.sort(copy);
                        return copy;
                    }
                }
                """, "Arrays.sort");
        assertLibraryShortcutRejected("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        return java.util.Arrays.stream(input).sorted().toArray();
                    }
                }
                """, "stream sorted");
        assertLibraryShortcutRejected("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        var values = new java.util.TreeSet<Integer>();
                        for (int value : input) values.add(value);
                        return values.stream().mapToInt(Integer::intValue).toArray();
                    }
                }
                """, "TreeSet");
        assertLibraryShortcutRejected("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        var values = new java.util.PriorityQueue<Integer>();
                        for (int value : input) values.add(value);
                        int[] result = new int[input.length];
                        for (int i = 0; i < result.length; i++) result[i] = values.remove();
                        return result;
                    }
                }
                """, "PriorityQueue");
        assertInsertionContractRejected("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        int[] result = input.clone();
                        for (int end = result.length - 1; end > 0; end--) {
                            for (int index = 0; index < end; index++) {
                                if (result[index] > result[index + 1]) {
                                    int temporary = result[index];
                                    result[index] = result[index + 1];
                                    result[index + 1] = temporary;
                                }
                            }
                        }
                        return result;
                    }
                }
                """, "bubble sort");
        assertInsertionContractRejected("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        int[] result = input.clone();
                        for (int end = result.length - 1; end > 0; end--) {
                            for (int index = 0; index < end; index++) {
                                if (result[index] > result[index + 1]) {
                                    int temporary = result[index + 1];
                                    result[index + 1] = result[index];
                                    result[index] = temporary;
                                }
                            }
                        }
                        return result;
                    }
                }
                """, "bubble sort with right-value capture");
        assertInsertionContractRejected("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        int[] result = input.clone();
                        for (int index = 0; index < result.length; index++) {
                            int minimum = index;
                            for (int candidate = index + 1; candidate < result.length; candidate++) {
                                if (result[candidate] < result[minimum]) minimum = candidate;
                            }
                            int temporary = result[index];
                            result[index] = result[minimum];
                            result[minimum] = temporary;
                        }
                        return result;
                    }
                }
                """, "selection sort");
        assertLibraryShortcutRejected("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        int[] copy = input.clone();
                        java.util.function.Consumer<int[]> sorter = java.util.Arrays::sort;
                        sorter.accept(copy);
                        return copy;
                    }
                }
                """, "Arrays::sort");
        assertLibraryShortcutRejected("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        var values = new java.util.ArrayList<Integer>();
                        for (int value : input) values.add(value);
                        java.util.function.Consumer<java.util.List<Integer>> sorter =
                                java.util.Collections::sort;
                        sorter.accept(values);
                        return values.stream().mapToInt(Integer::intValue).toArray();
                    }
                }
                """, "Collections::sort");
        assertLibraryShortcutRejected("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        java.util.stream.IntStream values = java.util.Arrays.stream(input);
                        java.util.function.Supplier<java.util.stream.IntStream> sorter =
                                values::sorted;
                        return sorter.get().toArray();
                    }
                }
                """, "stream::sorted");
        assertInsertionContractRejected("""
                class Decoy {
                    static int[] solve(int[] input) {
                        int[] work = input.clone();
                        for (int boundary = 1; boundary < work.length; boundary++) {
                            int held = work[boundary];
                            int slot = boundary;
                            while (slot > 0 && work[slot - 1] > held) {
                                work[slot] = work[slot - 1];
                                slot--;
                            }
                            work[slot] = held;
                        }
                        return work;
                    }
                }

                public class Solution {
                    public static int[] solve(int[] input) {
                        return input.clone();
                    }
                }
                """, "another class decoy solve");
        assertInsertionContractRejected("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        int[] work = input.clone();
                        if (false) {
                            for (int boundary = 1; boundary < work.length; boundary++) {
                                int held = work[boundary];
                                int slot = boundary;
                                while (slot > 0 && work[slot - 1] > held) {
                                    work[slot] = work[slot - 1];
                                    slot--;
                                }
                                work[slot] = held;
                            }
                        }
                        return work;
                    }
                }
                """, "if(false) decoy");
        assertInsertionContractRejected("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        int[] work = input.clone();
                        if (work.length < 0) {
                            for (int boundary = 1; boundary < work.length; boundary++) {
                                int held = work[boundary];
                                int slot = boundary;
                                while (slot > 0 && work[slot - 1] > held) {
                                    work[slot] = work[slot - 1];
                                    slot--;
                                }
                                work[slot] = held;
                            }
                        }
                        return work;
                    }
                }
                """, "impossible length branch decoy");
        assertInsertionContractRejected("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        int[] work = input.clone();
                        while (work.length < 0) {
                            int held = work[0];
                            int slot = 0;
                            while (slot > 0) {
                                work[slot] = work[slot - 1];
                                slot--;
                            }
                            work[slot] = held;
                        }
                        return work;
                    }
                }
                """, "impossible outer loop decoy");
        assertDelegatedImplementationRejected("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        return insertionSort(input);
                    }

                    private static int[] insertionSort(int[] input) {
                        int[] work = input.clone();
                        for (int boundary = 1; boundary < work.length; boundary++) {
                            int held = work[boundary];
                            int slot = boundary;
                            while (slot > 0 && work[slot - 1] > held) {
                                work[slot] = work[slot - 1];
                                slot--;
                            }
                            work[slot] = held;
                        }
                        return work;
                    }
                }
                """, "delegated helper implementation");
        assertDelegatedImplementationRejected("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        int[] work = input.clone();
                        java.util.function.Consumer<int[]> sorter =
                                values -> java.util.Arrays.sort(values);
                        sorter.accept(work);
                        for (int boundary = 1; boundary < work.length; boundary++) {
                            int held = work[boundary];
                            int slot = boundary;
                            while (slot > 0 && work[slot - 1] > held) {
                                work[slot] = work[slot - 1];
                                slot--;
                            }
                            work[slot] = held;
                        }
                        return work;
                    }
                }
                """, "lambda sort with reachable structure decoy");
        assertDelegatedImplementationRejected("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        class Sorter {
                            void apply(int[] values) {
                                java.util.Arrays.sort(values);
                            }
                        }
                        int[] work = input.clone();
                        new Sorter().apply(work);
                        for (int boundary = 1; boundary < work.length; boundary++) {
                            int held = work[boundary];
                            int slot = boundary;
                            while (slot > 0 && work[slot - 1] > held) {
                                work[slot] = work[slot - 1];
                                slot--;
                            }
                            work[slot] = held;
                        }
                        return work;
                    }
                }
                """, "local class sort with reachable structure decoy");
        assertDelegatedImplementationRejected("""
                public class Solution {
                    public static int[] solve(int[] input) {
                        int[] work = input.clone();
                        java.util.function.Consumer<int[]> sorter =
                                new java.util.function.Consumer<>() {
                                    public void accept(int[] values) {
                                        java.util.Arrays.sort(values);
                                    }
                                };
                        sorter.accept(work);
                        for (int boundary = 1; boundary < work.length; boundary++) {
                            int held = work[boundary];
                            int slot = boundary;
                            while (slot > 0 && work[slot - 1] > held) {
                                work[slot] = work[slot - 1];
                                slot--;
                            }
                            work[slot] = held;
                        }
                        return work;
                    }
                }
                """, "anonymous class sort with reachable structure decoy");
        assertInsertionContractRejected("""
                public class Solution {
                    static int[] solve(int[] input) {
                        int[] work = input.clone();
                        for (int boundary = 1; boundary < work.length; boundary++) {
                            int held = work[boundary];
                            int slot = boundary;
                            while (slot > 0 && work[slot - 1] > held) {
                                work[slot] = work[slot - 1];
                                slot--;
                            }
                            work[slot] = held;
                        }
                        return work;
                    }
                }
                """, "wrong solve signature");
    }

    private static void enforcesSourceContractInIsolatedHelper() throws Exception {
        String source = """
                public class Solution {
                    public static int[] solve(int[] input) {
                        int[] copy = input.clone();
                        java.util.Arrays.sort(copy);
                        return copy;
                    }
                }
                """;

        JavaRunnerServer.Evaluation result = JavaRunnerServer.evaluate(
                "Solution",
                source,
                "this harness must not be compiled",
                "insertion-sort",
                "SOURCE_CONTRACT_TEST_TOKEN"
        );

        check("SOURCE_CONTRACT_FAILED".equals(result.status()),
                "격리된 소스 계약 검사가 우회되었습니다: "
                        + result.status() + " / " + result.details());
        check(!result.details().contains("java.util.Arrays.sort(copy)"),
                "소스 계약 안내에 제출 코드나 기준 구현이 노출되었습니다.");

        assertIsolatedContractAccepted(
                "task-chain-linked-queue",
                """
                        public class Solution {}
                        final class TaskChain {
                            private static final class Node {
                                final String value;
                                Node next;
                                Node(String value) { this.value = value; }
                            }
                            private Node head;
                            private Node tail;
                            private int size;
                            void addLast(String value) {
                                Node node = new Node(value);
                                if (tail == null) {
                                    head = tail = node;
                                } else {
                                    tail.next = node;
                                    tail = node;
                                }
                                size++;
                            }
                            String removeFirst() {
                                if (head == null) {
                                    throw new java.util.NoSuchElementException();
                                }
                                String value = head.value;
                                head = head.next;
                                size--;
                                if (head == null) tail = null;
                                return value;
                            }
                        }
                        """);
        assertIsolatedContractRejected(
                "task-chain-linked-queue",
                """
                        public class Solution {}
                        final class TaskChain {
                            private static final class Node {
                                final String value;
                                Node next;
                                Node(String value) { this.value = value; }
                            }
                            private Node head;
                            private Node tail;
                            private int size;
                            void addLast(String value) {
                                append(value);
                            }
                            private void append(String value) {
                                Node node = new Node(value);
                                if (tail == null) {
                                    head = tail = node;
                                } else {
                                    tail.next = node;
                                    tail = node;
                                }
                                size++;
                            }
                            String removeFirst() {
                                if (head == null) {
                                    throw new java.util.NoSuchElementException();
                                }
                                String value = head.value;
                                head = head.next;
                                size--;
                                if (head == null) tail = null;
                                return value;
                            }
                        }
                        """);

        assertIsolatedContractAccepted(
                "deque-workshop-array-deque",
                """
                        import java.util.*;
                        public class Solution {}
                        final class DequeWorkshop {
                            static List<String> reverse(List<String> values) {
                                Deque<String> deque = new ArrayDeque<>(values);
                                List<String> result = new ArrayList<>();
                                while (!deque.isEmpty()) {
                                    String value = deque.removeLast();
                                    result.add(value);
                                }
                                return List.copyOf(result);
                            }
                            static List<String> serve(List<String> values) {
                                Deque<String> deque = new ArrayDeque<>(values);
                                List<String> result = new ArrayList<>();
                                while (!deque.isEmpty()) {
                                    String value = deque.removeFirst();
                                    result.add(value);
                                }
                                return result;
                            }
                        }
                        """);
        assertIsolatedContractRejected(
                "deque-workshop-array-deque",
                """
                        import java.util.*;
                        public class Solution {}
                        final class DequeWorkshop {
                            static List<String> reverse(List<String> values) {
                                Deque<String> ignored = new ArrayDeque<>();
                                List<String> result = new ArrayList<>(values);
                                Collections.reverse(result);
                                return result;
                            }
                            static List<String> serve(List<String> values) {
                                Deque<String> ignored = new ArrayDeque<>();
                                return List.copyOf(values);
                            }
                        }
                        """);
    }

    private static void runsSafeCodeWithRestrictedPermissions() throws Exception {
        String source = """
                public class Solution {
                    public static boolean solve() {
                        try {
                            System.getSecurityManager().checkRead("/etc/passwd");
                            return false;
                        } catch (SecurityException expected) {
                            return System.getSecurityManager() != null;
                        }
                    }
                }
                """;
        String token = "SECURITY_TEST_TOKEN";
        String harness = """
                public final class QuestHarness {
                    public static void main(String[] args) {
                        boolean passed = Solution.solve();
                        System.out.println("SECURITY_TEST_TOKEN\\tCASE\\tPUBLIC\\t1\\t"
                                + (passed ? "PASSED" : "FAILED"));
                        System.out.println("SECURITY_TEST_TOKEN\\tSUMMARY\\t"
                                + (passed ? "1" : "0") + "\\t1\\t"
                                + (passed ? "1" : "0") + "\\t1\\t0\\t0");
                    }
                }
                """;

        JavaRunnerServer.Evaluation result =
                JavaRunnerServer.evaluate("Solution", source, harness, token);

        check("PASSED".equals(result.status()),
                "샌드박스 권한 테스트 실패: " + result.status() + " / " + result.details());
    }

    private static void runsHarnessWithoutPrivilegedPermissions() throws Exception {
        String source = "public class Solution {}";
        String token = "HARNESS_SECURITY_TEST_TOKEN";
        String harness = """
                public final class QuestHarness {
                    public static void main(String[] args) {
                        boolean denied;
                        try {
                            System.getSecurityManager().checkRead("/etc/passwd");
                            denied = false;
                        } catch (SecurityException expected) {
                            denied = true;
                        }
                        System.out.println("HARNESS_SECURITY_TEST_TOKEN\\tCASE\\tPUBLIC\\t1\\t"
                                + (denied ? "PASSED" : "FAILED"));
                        System.out.println("HARNESS_SECURITY_TEST_TOKEN\\tSUMMARY\\t"
                                + (denied ? "1" : "0") + "\\t1\\t"
                                + (denied ? "1" : "0") + "\\t1\\t0\\t0");
                    }
                }
                """;

        JavaRunnerServer.Evaluation result =
                JavaRunnerServer.evaluate("Solution", source, harness, token);

        check("PASSED".equals(result.status()),
                "harness 권한 축소 테스트 실패: " + result.status() + " / " + result.details());
    }

    private static void assertInvalidToken(String token) {
        try {
            JavaRunnerServer.requireRunnerToken(token);
            throw new AssertionError("취약한 runner token을 허용했습니다.");
        } catch (IllegalStateException expected) {
            // 예상한 fail-fast 경로입니다.
        }
    }

    private static void validatesMemberBadgeConstructorDelegationSourceContract() {
        SourceContractChecker.Result accepted = SourceContractChecker.check(
                "member-badge-constructor-delegation",
                """
                        public class Solution {}
                        final class MemberBadge {
                            private final String owner;
                            private final String grade;
                            MemberBadge(String owner) {
                                this(owner, "일반");
                            }
                            MemberBadge(String owner, String grade) {
                                this.owner = owner;
                                this.grade = grade;
                            }
                        }
                        """);
        check(accepted.matched(),
                "올바른 MemberBadge 생성자 위임을 거부했습니다: " + accepted.guidance());

        SourceContractChecker.Result directInitialization = SourceContractChecker.check(
                "member-badge-constructor-delegation",
                """
                        public class Solution {}
                        final class MemberBadge {
                            private final String owner;
                            private final String grade;
                            MemberBadge(String owner) {
                                this.owner = owner;
                                this.grade = "일반";
                            }
                            MemberBadge(String owner, String grade) {
                                this.owner = owner;
                                this.grade = grade;
                            }
                        }
                        """);
        check(!directInitialization.matched(),
                "this(...)를 사용하지 않은 MemberBadge 생성자를 허용했습니다.");

        SourceContractChecker.Result staticState = SourceContractChecker.check(
                "member-badge-constructor-delegation",
                """
                        public class Solution {}
                        final class MemberBadge {
                            private static String owner;
                            private static String grade;
                            MemberBadge(String owner) {
                                this(owner, "일반");
                            }
                            MemberBadge(String owner, String grade) {
                                MemberBadge.owner = owner;
                                MemberBadge.grade = grade;
                            }
                        }
                        """);
        check(!staticState.matched(), "MemberBadge의 static 공유 상태를 허용했습니다.");
    }

    private static void validatesCheckedPortExceptionSourceContract() {
        SourceContractChecker.Result accepted = SourceContractChecker.check(
                "checked-port-exception",
                """
                        public class Solution {}
                        final class PortValueException extends Exception {}
                        final class ServicePort {
                            static int parse(String text) throws PortValueException {
                                return 1;
                            }
                        }
                        """);
        check(accepted.matched(),
                "올바른 checked 포트 예외 계약을 거부했습니다: " + accepted.guidance());

        SourceContractChecker.Result unchecked = SourceContractChecker.check(
                "checked-port-exception",
                """
                        public class Solution {}
                        final class PortValueException extends RuntimeException {}
                        final class ServicePort {
                            static int parse(String text) {
                                return 1;
                            }
                        }
                        """);
        check(!unchecked.matched(), "unchecked 포트 예외와 누락된 throws를 허용했습니다.");

        SourceContractChecker.Result missingThrows = SourceContractChecker.check(
                "checked-port-exception",
                """
                        public class Solution {}
                        final class PortValueException extends Exception {}
                        final class ServicePort {
                            static int parse(String text) {
                                return 1;
                            }
                        }
                        """);
        check(!missingThrows.matched(), "PortValueException throws 선언 누락을 허용했습니다.");
    }

    private static void validatesTaskChainLinkedQueueSourceContract() {
        assertTaskChainContractAccepted("""
                import java.util.*;
                public class Solution {}
                final class TaskChain {
                    private static final class Node {
                        final String value;
                        Node next;
                        Node(String value) {
                            this.value = value;
                        }
                    }
                    private Node head;
                    private Node tail;
                    private int size;

                    void addLast(String value) {
                        Node node = new Node(value);
                        if (tail == null) {
                            head = tail = node;
                        } else {
                            tail.next = node;
                            tail = node;
                        }
                        size++;
                    }

                    String removeFirst() {
                        if (head == null) throw new NoSuchElementException();
                        String value = head.value;
                        head = head.next;
                        size--;
                        if (head == null) tail = null;
                        return value;
                    }

                    List<String> snapshot() {
                        List<String> values = new ArrayList<>();
                        for (Node current = head; current != null; current = current.next) {
                            values.add(current.value);
                        }
                        return values;
                    }
                }
                """, "기준 단일 연결 구현");

        assertTaskChainContractAccepted("""
                public class Solution {}
                final class TaskChain {
                    private static final class Node {
                        final String value;
                        Node next;
                        Node(String value) {
                            this.value = value;
                        }
                    }
                    private Node head;
                    private Node tail;
                    private int size;

                    void addLast(String value) {
                        Node node = new Node(value);
                        if (this.tail == null) {
                            this.head = node;
                            this.tail = node;
                        } else {
                            this.tail.next = node;
                            this.tail = node;
                        }
                        this.size++;
                    }

                    String removeFirst() {
                        if (this.head == null) {
                            throw new java.util.NoSuchElementException();
                        }
                        Node first = this.head;
                        String removed = first.value;
                        this.head = first.next;
                        this.size--;
                        if (this.head == null) {
                            this.tail = this.head;
                        }
                        return removed;
                    }
                }
                """, "this 필드와 한 단계 head 별칭을 사용한 동등 구현");

        assertTaskChainContractRejected("""
                import java.util.*;
                public class Solution {}
                final class TaskChain {
                    private static final class Node {
                        final String value;
                        Node next;
                        Node(String value) {
                            this.value = value;
                        }
                    }
                    private Node head;
                    private Node tail;
                    private int size;
                    private final Deque<String> queue = new ArrayDeque<>();

                    void addLast(String value) {
                        queue.addLast(value);
                        size++;
                    }

                    String removeFirst() {
                        String value = queue.removeFirst();
                        size--;
                        return value;
                    }
                }
                """, "Node 필드를 decoy로 둔 ArrayDeque 위임");

        assertTaskChainContractRejected("""
                public class Solution {}
                final class TaskChain {
                    private static final class Node {
                        final String value;
                        Node next;
                        Node(String value) {
                            this.value = value;
                        }
                    }
                    private Node head;
                    private Node tail;
                    private int size;

                    void addLast(String value) {
                        Node node = new Node(value);
                        Node cursor = head;
                        while (cursor != null && cursor.next != null) {
                            cursor = cursor.next;
                        }
                        if (tail == null) {
                            head = tail = node;
                        } else {
                            tail.next = node;
                            tail = node;
                        }
                        size++;
                    }

                    String removeFirst() {
                        if (head == null) throw new java.util.NoSuchElementException();
                        String value = head.value;
                        head = head.next;
                        if (head == null) tail = null;
                        size--;
                        return value;
                    }
                }
                """, "정상 대입 앞에서 전체 연결을 순회하는 구현");

        assertTaskChainContractRejected("""
                public class Solution {}
                final class TaskChain {
                    private static final class Node {
                        final String value;
                        Node next;
                        Node(String value) {
                            this.value = value;
                        }
                    }
                    private Node head;
                    private Node tail;
                    private int size;

                    void addLast(String value) {
                        append(value);
                    }

                    private void append(String value) {
                        Node node = new Node(value);
                        if (tail == null) {
                            head = tail = node;
                        } else {
                            tail.next = node;
                            tail = node;
                        }
                        size++;
                    }

                    String removeFirst() {
                        if (head == null) throw new java.util.NoSuchElementException();
                        String value = head.value;
                        head = head.next;
                        if (head == null) tail = null;
                        size--;
                        return value;
                    }
                }
                """, "핵심 연결을 helper로 위임한 구현");
    }

    private static void validatesDequeWorkshopArrayDequeSourceContract() {
        assertDequeWorkshopContractAccepted("""
                import java.util.*;
                public class Solution {}
                final class DequeWorkshop {
                    static List<String> reverse(List<String> values) {
                        Deque<String> deque = new ArrayDeque<>();
                        for (String value : values) deque.addLast(value);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) {
                            result.add(deque.removeLast());
                        }
                        return List.copyOf(result);
                    }

                    static List<String> serve(List<String> values) {
                        Deque<String> deque = new ArrayDeque<>();
                        for (String value : values) deque.addLast(value);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) {
                            result.add(deque.removeFirst());
                        }
                        return List.copyOf(result);
                    }
                }
                """, "기준 addLast/removeLast·removeFirst 구현");

        assertDequeWorkshopContractAccepted("""
                import java.util.*;
                public class Solution {}
                final class DequeWorkshop {
                    static List<String> reverse(List<String> values) {
                        Deque<String> deque = new ArrayDeque<>();
                        for (String value : values) deque.push(value);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) {
                            String removed = deque.pop();
                            result.add(removed);
                        }
                        return result;
                    }

                    static List<String> serve(List<String> values) {
                        var deque = new java.util.ArrayDeque<String>(values);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) {
                            String removed = deque.pollFirst();
                            result.add(removed);
                        }
                        return result;
                    }
                }
                """, "제거값 지역 변수, push/pop과 var 생성자를 사용한 동등 구현");

        assertDequeWorkshopContractAccepted("""
                import java.util.*;
                public class Solution {}
                final class DequeWorkshop {
                    static List<String> reverse(List<String> values) {
                        Deque<String> deque = new ArrayDeque<>(values);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) result.add(deque.removeLast());
                        return Collections.unmodifiableList(result);
                    }

                    static List<String> serve(List<String> values) {
                        Deque<String> deque = new ArrayDeque<>(values);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) result.add(deque.removeFirst());
                        return new ArrayList<>(result);
                    }
                }
                """, "Collections 불변 래퍼와 ArrayList 복사 반환");

        assertDequeWorkshopContractRejected("""
                import java.util.*;
                public class Solution {}
                final class DequeWorkshop {
                    static List<String> reverse(List<String> values) {
                        Deque<String> ignored = new ArrayDeque<>();
                        List<String> result = new ArrayList<>(values);
                        Collections.reverse(result);
                        return result;
                    }

                    static List<String> serve(List<String> values) {
                        Deque<String> deque = new ArrayDeque<>(values);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) result.add(deque.removeFirst());
                        return result;
                    }
                }
                """, "미사용 ArrayDeque decoy와 Collections.reverse");

        assertDequeWorkshopContractRejected("""
                import java.util.*;
                public class Solution {}
                final class DequeWorkshop {
                    static List<String> reverse(List<String> values) {
                        List<String> result = new ArrayList<>(values);
                        Collections.reverse(result);
                        if (false) {
                            Deque<String> deque = new ArrayDeque<>();
                            for (String value : values) deque.addLast(value);
                            result.clear();
                            while (!deque.isEmpty()) result.add(deque.removeLast());
                        }
                        return result;
                    }

                    static List<String> serve(List<String> values) {
                        Deque<String> deque = new ArrayDeque<>(values);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) result.add(deque.removeFirst());
                        return result;
                    }
                }
                """, "리터럴 false 분기에 숨긴 ArrayDeque decoy");

        assertDequeWorkshopContractRejected("""
                import java.util.*;
                public class Solution {}
                final class DequeWorkshop {
                    static List<String> reverse(List<String> values) {
                        List<String> result = new ArrayList<>(values);
                        Collections.reverse(result);
                        if (values.size() < 0) {
                            Deque<String> deque = new ArrayDeque<>(values);
                            result.clear();
                            while (!deque.isEmpty()) result.add(deque.removeLast());
                        }
                        return result;
                    }

                    static List<String> serve(List<String> values) {
                        Deque<String> deque = new ArrayDeque<>(values);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) result.add(deque.removeFirst());
                        return result;
                    }
                }
                """, "List.size()의 불가능한 음수 분기에 숨긴 decoy");

        assertDequeWorkshopContractRejected("""
                import java.util.*;
                public class Solution {}
                final class DequeWorkshop {
                    static List<String> reverse(List<String> values) {
                        Deque<String> deque = new ArrayDeque<>(values);
                        List<String> dequeResult = new ArrayList<>();
                        while (!deque.isEmpty()) dequeResult.add(deque.removeLast());
                        List<String> shortcut = new ArrayList<>(values);
                        Collections.reverse(shortcut);
                        return Objects.requireNonNullElse(shortcut, dequeResult);
                    }

                    static List<String> serve(List<String> values) {
                        Deque<String> deque = new ArrayDeque<>(values);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) result.add(deque.removeFirst());
                        return result;
                    }
                }
                """, "임의 반환식의 식별자만으로 연결한 결과 decoy");

        assertDequeWorkshopContractRejected("""
                import java.util.*;
                public class Solution {}
                final class DequeWorkshop {
                    static List<String> reverse(List<String> values) {
                        Deque<String> deque = new ArrayDeque<>(values);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) result.add(deque.removeLast());
                        result = new ArrayList<>(values);
                        Collections.reverse(result);
                        return result;
                    }

                    static List<String> serve(List<String> values) {
                        Deque<String> deque = new ArrayDeque<>(values);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) result.add(deque.removeFirst());
                        return result;
                    }
                }
                """, "Deque 결과 증거 뒤 result를 shortcut으로 재대입");

        assertDequeWorkshopContractRejected("""
                import java.util.*;
                public class Solution {}
                final class DequeWorkshop {
                    static List<String> reverse(List<String> values) {
                        Deque<String> deque = new ArrayDeque<>(values);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) result.add(deque.removeLast());
                        return result;
                    }

                    static List<String> serve(List<String> values) {
                        Deque<String> deque = new ArrayDeque<>(values);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) result.add(deque.removeFirst());
                        result.clear();
                        result.addAll(values);
                        return result;
                    }
                }
                """, "clear 후 shortcut 값으로 다시 채운 result");

        assertDequeWorkshopContractRejected("""
                import java.util.*;
                public class Solution {}
                final class DequeWorkshop {
                    static List<String> reverse(List<String> values) {
                        Deque<String> deque = new LinkedList<>();
                        deque.addAll(values);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) result.add(deque.removeLast());
                        return result;
                    }

                    static List<String> serve(List<String> values) {
                        Deque<String> deque = new LinkedList<>();
                        deque.addAll(values);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) result.add(deque.removeFirst());
                        return result;
                    }
                }
                """, "ArrayDeque가 아닌 LinkedList 구현");

        assertDequeWorkshopContractRejected("""
                import java.util.*;
                public class Solution {}
                final class DequeWorkshop {
                    static List<String> reverse(List<String> values) {
                        Deque<String> deque = new ArrayDeque<>();
                        for (String value : values) deque.addLast(value);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) result.add(deque.removeFirst());
                        return result;
                    }

                    static List<String> serve(List<String> values) {
                        Deque<String> deque = new ArrayDeque<>();
                        for (String value : values) deque.addLast(value);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) result.add(deque.removeLast());
                        return result;
                    }
                }
                """, "reverse와 serve의 제거 끝을 뒤바꾼 구현");

        assertDequeWorkshopContractRejected("""
                import java.util.*;
                public class Solution {}
                final class CustomDeque<E> extends ArrayDeque<E> {}
                final class DequeWorkshop {
                    static List<String> reverse(List<String> values) {
                        Deque<String> deque = new CustomDeque<>();
                        deque.addAll(values);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) result.add(deque.removeLast());
                        return result;
                    }

                    static List<String> serve(List<String> values) {
                        Deque<String> deque = new CustomDeque<>();
                        deque.addAll(values);
                        List<String> result = new ArrayList<>();
                        while (!deque.isEmpty()) result.add(deque.removeFirst());
                        return result;
                    }
                }
                """, "ArrayDeque 하위 타입으로 직접 생성 계약을 우회한 구현");
    }

    private static void assertTaskChainContractAccepted(String source, String description) {
        SourceContractChecker.Result result =
                SourceContractChecker.check("task-chain-linked-queue", source);
        check(result.matched(),
                "동등한 TaskChain 구현을 거부했습니다: "
                        + description + " / " + result.guidance());
    }

    private static void assertTaskChainContractRejected(String source, String description) {
        SourceContractChecker.Result result =
                SourceContractChecker.check("task-chain-linked-queue", source);
        check(!result.matched(), "TaskChain 의도 위반 구현을 허용했습니다: " + description);
    }

    private static void assertDequeWorkshopContractAccepted(String source, String description) {
        SourceContractChecker.Result result =
                SourceContractChecker.check("deque-workshop-array-deque", source);
        check(result.matched(),
                "동등한 DequeWorkshop 구현을 거부했습니다: "
                        + description + " / " + result.guidance());
    }

    private static void assertDequeWorkshopContractRejected(String source, String description) {
        SourceContractChecker.Result result =
                SourceContractChecker.check("deque-workshop-array-deque", source);
        check(!result.matched(),
                "DequeWorkshop 의도 위반 구현을 허용했습니다: " + description);
    }

    private static void assertIsolatedContractAccepted(
            String sourceContract, String source) throws Exception {
        String token = "ISOLATED_" + sourceContract.replace('-', '_').toUpperCase();
        String harness = """
                public final class QuestHarness {
                    public static void main(String[] args) {
                        System.out.println("%s\\tCASE\\tPUBLIC\\t1\\tPASSED");
                        System.out.println("%s\\tSUMMARY\\t1\\t1\\t1\\t1\\t0\\t0");
                    }
                }
                """.formatted(token, token);
        JavaRunnerServer.Evaluation result = JavaRunnerServer.evaluate(
                "Solution", source, harness, sourceContract, token);
        check("PASSED".equals(result.status()),
                "격리된 sourceContract 정상 경로가 실패했습니다: "
                        + sourceContract + " / " + result.status() + " / " + result.details());
    }

    private static void assertIsolatedContractRejected(
            String sourceContract, String source) throws Exception {
        JavaRunnerServer.Evaluation result = JavaRunnerServer.evaluate(
                "Solution",
                source,
                "this harness must not be compiled",
                sourceContract,
                "REJECTED_" + sourceContract.replace('-', '_').toUpperCase()
        );
        check("SOURCE_CONTRACT_FAILED".equals(result.status()),
                "격리된 sourceContract 위반 경로가 우회되었습니다: "
                        + sourceContract + " / " + result.status() + " / " + result.details());
    }

    private static void assertForbidden(String source) {
        check(JavaRunnerServer.isForbiddenSource(source), "위험한 코드를 허용했습니다: " + source);
    }

    private static void assertInsertionContractAccepted(String source) {
        SourceContractChecker.Result result =
                SourceContractChecker.check("insertion-sort", source);
        check(result.matched(), "동등한 삽입 정렬 구현을 거부했습니다: " + result.guidance());
    }

    private static void assertInsertionContractRejected(String source, String description) {
        SourceContractChecker.Result result =
                SourceContractChecker.check("insertion-sort", source);
        check(!result.matched(), "의도 위반 구현을 허용했습니다: " + description);
    }

    private static void assertLibraryShortcutRejected(String source, String description) {
        SourceContractChecker.Result result =
                SourceContractChecker.check("insertion-sort", source);
        check(!result.matched(), "표준 정렬 우회를 허용했습니다: " + description);
        check(result.guidance().contains("Arrays·Collections"),
                "표준 정렬 우회를 구조 누락으로 잘못 분류했습니다: "
                        + description + " / " + result.guidance());
    }

    private static void assertDelegatedImplementationRejected(String source, String description) {
        SourceContractChecker.Result result =
                SourceContractChecker.check("insertion-sort", source);
        check(!result.matched(), "helper 위임 우회를 허용했습니다: " + description);
        check(result.guidance().contains("helper"),
                "helper 위임을 직접 구현 누락으로 안내하지 않았습니다: "
                        + description + " / " + result.guidance());
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
