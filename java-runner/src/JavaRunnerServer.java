import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

public final class JavaRunnerServer {
    private static final int PORT = Integer.parseInt(System.getenv().getOrDefault("PORT", "3002"));
    private static final int MAX_REQUEST_BYTES = 220_000;
    private static final int MAX_SOURCE_LENGTH = 60_000;
    private static final int MAX_OUTPUT_BYTES = 24_000;
    private static final int MIN_RUNNER_TOKEN_BYTES = 32;
    static final int CONTAINER_MEMORY_MIB = 256;
    static final int SERVER_PROCESS_BUDGET_MIB = 88;
    static final int MAX_CHILD_PROCESS_BUDGET_MIB = 96;
    static final int NATIVE_MEMORY_HEADROOM_MIB = 72;
    static final int MAX_CONCURRENT_EVALUATIONS = 1;
    private static final Duration COMPILE_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration SOURCE_CONTRACT_TIMEOUT = Duration.ofSeconds(2);
    private static final Duration RUN_TIMEOUT = Duration.ofSeconds(2);
    private static final String HELPER_CLASSPATH =
            Path.of("").toAbsolutePath().normalize().toString();
    private static final String RUNNER_TOKEN_ENV = "JAVA_RUNNER_TOKEN";
    private static final String RUNNER_TOKEN_HEADER = "X-Code-Quest-Runner-Token";
    private static final Set<String> SOURCE_CONTRACTS = Set.of(
            "none",
            "insertion-sort",
            "member-badge-constructor-delegation",
            "checked-port-exception",
            "task-chain-linked-queue",
            "deque-workshop-array-deque"
    );
    private static final ExecutorService REQUESTS = Executors.newFixedThreadPool(4);
    private static final ExecutorService STREAMS = Executors.newVirtualThreadPerTaskExecutor();
    // 256 MiB 컨테이너에서 compiler JVM 두 개가 겹치지 않도록 채점을 직렬화합니다.
    private static final Semaphore EVALUATION_SLOTS =
            new Semaphore(MAX_CONCURRENT_EVALUATIONS);
    private static final Pattern CLASS_NAME = Pattern.compile("[A-Za-z_$][A-Za-z0-9_$]*");
    private static final Pattern UNICODE_ESCAPE = Pattern.compile("\\\\u+[0-9a-fA-F]{4}");
    private static final Pattern BIDI_CONTROL = Pattern.compile("[\\u202A-\\u202E\\u2066-\\u2069]");
    private static final Pattern BLOCK_COMMENT = Pattern.compile("/\\*.*?\\*/", Pattern.DOTALL);
    private static final Pattern LINE_COMMENT = Pattern.compile("//[^\\r\\n]*");
    private static final List<Pattern> FORBIDDEN = List.of(
            Pattern.compile("\\bpackage\\s+"),
            Pattern.compile("\\bjava\\s*\\.\\s*(?:io|net|nio|rmi|sql|management"
                    + "|lang\\s*\\.\\s*(?:reflect|invoke|instrument))\\b"),
            Pattern.compile("\\bjavax\\s*\\.\\s*(?:script|naming|management)\\b"),
            Pattern.compile("\\bjdk\\s*\\."),
            Pattern.compile("\\b(?:sun|com\\s*\\.\\s*sun)\\s*\\."),
            Pattern.compile("\\bjavax\\s*\\.\\s*tools\\b"),
            Pattern.compile("\\bProcessBuilder\\b"),
            Pattern.compile("\\bRuntime\\b"),
            Pattern.compile("\\bSystem\\s*\\.\\s*(?:exit|getenv|getPropert(?:y|ies)|setProperty"
                    + "|clearProperty|setSecurityManager|setOut|setErr|load|loadLibrary)\\b"),
            Pattern.compile("\\bClassLoader\\b"),
            Pattern.compile("\\bClass\\s*\\.\\s*forName\\b"),
            Pattern.compile("\\b(?:getDeclaredMethod|getDeclaredField|getMethod|getField"
                    + "|setAccessible|trySetAccessible)\\s*\\("),
            Pattern.compile("\\bjava\\s*\\.\\s*util\\s*\\.\\s*concurrent\\b"),
            Pattern.compile("\\b(?:Thread|Executors|ForkJoinPool|CompletableFuture)\\b"),
            Pattern.compile("\\bnative\\s+")
    );

    private JavaRunnerServer() {}

    public static void main(String[] args) throws IOException {
        String runnerToken = requireRunnerToken(System.getenv(RUNNER_TOKEN_ENV));
        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        server.createContext("/health", exchange -> {
            if (!"GET".equals(exchange.getRequestMethod())) {
                respond(exchange, 405, "METHOD_NOT_ALLOWED\n");
                return;
            }
            respond(exchange, 200, "OK\n");
        });
        server.createContext("/evaluate", exchange -> handleEvaluation(exchange, runnerToken));
        server.setExecutor(REQUESTS);
        server.start();
        System.out.println("Java runner listening on " + PORT);
    }

    private static void handleEvaluation(HttpExchange exchange, String runnerToken) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            respond(exchange, 405, "METHOD_NOT_ALLOWED\n");
            return;
        }
        if (!isAuthorized(runnerToken, exchange.getRequestHeaders().getFirst(RUNNER_TOKEN_HEADER))) {
            respond(exchange, 401, "UNAUTHORIZED\n");
            return;
        }

        byte[] raw = exchange.getRequestBody().readNBytes(MAX_REQUEST_BYTES + 1);
        if (raw.length > MAX_REQUEST_BYTES) {
            respond(exchange, 413, encode(new Evaluation("INVALID_REQUEST", "요청 크기가 제한을 초과했습니다.")));
            return;
        }

        try {
            String[] parts = new String(raw, StandardCharsets.UTF_8).split("\\n", 4);
            if (parts.length != 4 || !CLASS_NAME.matcher(parts[0]).matches()) {
                respond(exchange, 400, encode(new Evaluation("INVALID_REQUEST", "실행 요청 형식이 올바르지 않습니다.")));
                return;
            }
            String source = decodeBase64(parts[1]);
            String protocolToken = "QUEST_" + UUID.randomUUID().toString().replace("-", "");
            String harness = decodeBase64(parts[2]).replace("__QUEST_TOKEN__", protocolToken);
            String sourceContract = decodeBase64(parts[3]);
            if (source.length() > MAX_SOURCE_LENGTH || harness.length() > MAX_SOURCE_LENGTH * 2) {
                respond(exchange, 413, encode(new Evaluation("INVALID_REQUEST", "코드 크기가 제한을 초과했습니다.")));
                return;
            }
            if (!SOURCE_CONTRACTS.contains(sourceContract)) {
                respond(exchange, 400, encode(
                        new Evaluation("INVALID_REQUEST", "지원하지 않는 소스 코드 계약입니다.")));
                return;
            }
            if (!EVALUATION_SLOTS.tryAcquire()) {
                respond(exchange, 429, encode(new Evaluation(
                        "RUNNER_BUSY", "동시에 실행할 수 있는 채점 수를 초과했습니다. 잠시 후 다시 시도해 주세요.")));
                return;
            }
            try {
                respond(exchange, 200, encode(
                        evaluate(parts[0], source, harness, sourceContract, protocolToken)));
            } finally {
                EVALUATION_SLOTS.release();
            }
        } catch (IllegalArgumentException exception) {
            respond(exchange, 400, encode(new Evaluation("INVALID_REQUEST", "실행 요청을 해석할 수 없습니다.")));
        } catch (Exception exception) {
            respond(exchange, 500, encode(new Evaluation("RUNNER_ERROR", "채점 실행기 내부 오류가 발생했습니다.")));
        }
    }

    static Evaluation evaluate(String className, String source, String harness,
                               String protocolToken) throws IOException {
        return evaluate(className, source, harness, "none", protocolToken);
    }

    static Evaluation evaluate(String className, String source, String harness,
                               String sourceContract, String protocolToken) throws IOException {
        if (isForbiddenSource(source)) {
            return new Evaluation("FORBIDDEN_API",
                    "학습 실행 환경에서 허용하지 않는 파일·네트워크·프로세스·리플렉션·스레드 API가 포함되어 있습니다.");
        }

        Path work = Files.createTempDirectory("code-quest-");
        try {
            Path submission = Files.createDirectory(work.resolve("submission"));
            Path harnessClasses = Files.createDirectory(work.resolve("harness"));
            Files.writeString(work.resolve(className + ".java"), source, StandardCharsets.UTF_8);
            Files.writeString(work.resolve("QuestHarness.java"), harness, StandardCharsets.UTF_8);
            Path policy = writeSandboxPolicy(work);

            Execution submissionCompile = execute(List.of(
                    "javac", "-J-Xms16m", "-J-Xmx56m",
                    "-J-XX:MaxMetaspaceSize=40m", "-J-XX:ActiveProcessorCount=1",
                    "-J-XX:+ExitOnOutOfMemoryError", "-encoding", "UTF-8",
                    "-Xlint:none", "-proc:none", "-d", submission.toString(),
                    work.resolve(className + ".java").toString()
            ), work, COMPILE_TIMEOUT);
            if (submissionCompile.timedOut()) {
                return new Evaluation("COMPILE_ERROR", "컴파일 제한 시간을 초과했습니다.");
            }
            if (submissionCompile.exitCode() != 0) {
                return new Evaluation("COMPILE_ERROR", sanitize(submissionCompile.output(), work));
            }

            Evaluation sourceContractFailure = evaluateSourceContract(
                    sourceContract, work.resolve(className + ".java"), work);
            if (sourceContractFailure != null) return sourceContractFailure;

            Execution harnessCompile = execute(List.of(
                    "javac", "-J-Xms16m", "-J-Xmx56m",
                    "-J-XX:MaxMetaspaceSize=40m", "-J-XX:ActiveProcessorCount=1",
                    "-J-XX:+ExitOnOutOfMemoryError", "-encoding", "UTF-8",
                    "-Xlint:none", "-proc:none", "-cp", submission.toString(),
                    "-d", harnessClasses.toString(), work.resolve("QuestHarness.java").toString()
            ), work, COMPILE_TIMEOUT);
            if (harnessCompile.timedOut()) {
                return new Evaluation("COMPILE_ERROR", "테스트 준비 제한 시간을 초과했습니다.");
            }
            if (harnessCompile.exitCode() != 0) {
                return new Evaluation("COMPILE_ERROR", "문제 테스트를 준비하지 못했습니다.");
            }

            Execution run = execute(List.of(
                    "java", "-Xms16m", "-Xmx48m", "-Xss256k",
                    "-XX:MaxMetaspaceSize=40m", "-XX:MaxDirectMemorySize=8m",
                    "-XX:ActiveProcessorCount=1", "-XX:+ExitOnOutOfMemoryError",
                    "-Djava.awt.headless=true", "-Dfile.encoding=UTF-8",
                    "-Djava.security.manager=default",
                    "-Djava.security.policy==" + policy,
                    "-cp", harnessClasses + System.getProperty("path.separator") + submission,
                    "QuestHarness"
            ), work, RUN_TIMEOUT);
            if (run.timedOut()) {
                return new Evaluation("TIME_LIMIT", "코드 실행이 2초 제한을 초과했습니다.");
            }

            String[] lines = run.output().split("\\R");
            StringBuilder protocol = new StringBuilder();
            String summary = null;
            boolean caseError = false;
            String protocolPrefix = protocolToken + "\t";
            for (String line : lines) {
                if (!line.startsWith(protocolPrefix)) continue;
                String payload = line.substring(protocolPrefix.length());
                if (payload.startsWith("CASE\t")) {
                    protocol.append(payload).append('\n');
                    String[] fields = payload.split("\\t", 5);
                    if (fields.length >= 4 && "ERROR".equals(fields[3])) caseError = true;
                } else if (payload.startsWith("SUMMARY\t")) {
                    summary = payload;
                }
            }
            if (summary != null) {
                protocol.append(summary);
                String[] fields = summary.split("\\t");
                if (fields.length == 7) {
                    int passed = Integer.parseInt(fields[1]);
                    int total = Integer.parseInt(fields[2]);
                    String status = caseError ? "RUNTIME_ERROR" : passed == total ? "PASSED" : "TEST_FAILED";
                    return new Evaluation(status, protocol.toString());
                }
            }

            if (run.exitCode() != 0) {
                return new Evaluation("RUNTIME_ERROR", sanitize(run.output(), work));
            }
            return new Evaluation("RUNTIME_ERROR",
                    "프로그램이 종료되었지만 테스트 결과를 확인하지 못했습니다. 출력 변경이나 예외 발생 여부를 확인해 주세요.");
        } finally {
            deleteRecursively(work);
        }
    }

    private static Evaluation evaluateSourceContract(
            String sourceContract, Path sourceFile, Path work) throws IOException {
        if (sourceContract == null || sourceContract.isBlank() || "none".equals(sourceContract)) {
            return null;
        }

        Execution check = execute(List.of(
                "java", "-Xms16m", "-Xmx40m",
                "-XX:MaxMetaspaceSize=32m", "-XX:ActiveProcessorCount=1",
                "-XX:+ExitOnOutOfMemoryError",
                "-Dfile.encoding=UTF-8",
                "-cp", HELPER_CLASSPATH,
                "SourceContractChecker", sourceContract, sourceFile.toString()
        ), work, SOURCE_CONTRACT_TIMEOUT);
        if (check.timedOut()) {
            return new Evaluation(
                    "RUNNER_ERROR", "소스 코드 구조 검사 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
        }

        String[] lines = check.output().strip().split("\\R", 2);
        if (check.exitCode() == 0 && lines.length >= 1 && "PASSED".equals(lines[0])) {
            return null;
        }
        if (check.exitCode() == 2 && lines.length == 2 && "FAILED".equals(lines[0])) {
            try {
                return new Evaluation("SOURCE_CONTRACT_FAILED", decodeBase64(lines[1].strip()));
            } catch (IllegalArgumentException exception) {
                return new Evaluation("RUNNER_ERROR", "소스 코드 구조 검사 결과를 해석하지 못했습니다.");
            }
        }
        return new Evaluation("RUNNER_ERROR", "소스 코드 구조 검사기를 사용할 수 없습니다.");
    }

    static Duration evaluationPhaseBudget() {
        return COMPILE_TIMEOUT.multipliedBy(2)
                .plus(SOURCE_CONTRACT_TIMEOUT)
                .plus(RUN_TIMEOUT);
    }

    static boolean isForbiddenSource(String source) {
        if (source.indexOf('\0') >= 0
                || UNICODE_ESCAPE.matcher(source).find()
                || BIDI_CONTROL.matcher(source).find()) {
            return true;
        }
        String withoutComments = LINE_COMMENT.matcher(
                BLOCK_COMMENT.matcher(source).replaceAll(" ")
        ).replaceAll(" ");
        for (Pattern pattern : FORBIDDEN) {
            if (pattern.matcher(source).find() || pattern.matcher(withoutComments).find()) {
                return true;
            }
        }
        return false;
    }

    private static Path writeSandboxPolicy(Path work) throws IOException {
        String policy = """
                grant {
                  permission java.util.PropertyPermission "file.encoding", "read";
                };
                """;
        Path policyFile = work.resolve("sandbox.policy");
        Files.writeString(policyFile, policy, StandardCharsets.UTF_8);
        return policyFile;
    }

    static String requireRunnerToken(String token) {
        if (!isAcceptableRunnerToken(token)) {
            throw new IllegalStateException(
                    RUNNER_TOKEN_ENV + " must be a non-placeholder secret of at least "
                            + MIN_RUNNER_TOKEN_BYTES + " UTF-8 bytes.");
        }
        return token;
    }

    static boolean isAuthorized(String expected, String supplied) {
        byte[] expectedBytes = expected.getBytes(StandardCharsets.UTF_8);
        byte[] suppliedBytes = supplied == null
                ? new byte[0]
                : supplied.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expectedBytes, suppliedBytes);
    }

    private static boolean isAcceptableRunnerToken(String token) {
        if (token == null || token.isBlank()) return false;
        String normalized = token.toLowerCase();
        return token.getBytes(StandardCharsets.UTF_8).length >= MIN_RUNNER_TOKEN_BYTES
                && !normalized.contains("replace-with")
                && !normalized.contains("change-me")
                && !normalized.contains("changeme");
    }

    private static Execution execute(List<String> command, Path work, Duration timeout) throws IOException {
        Process process = new ProcessBuilder(new ArrayList<>(command))
                .directory(work.toFile())
                .redirectErrorStream(true)
                .start();
        CompletableFuture<String> output = CompletableFuture.supplyAsync(
                () -> readLimited(process.getInputStream()), STREAMS);
        boolean finished;
        try {
            finished = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
            return new Execution(-1, true, "실행이 중단되었습니다.");
        }
        if (!finished) {
            destroyProcessTree(process);
            try {
                process.waitFor(1, TimeUnit.SECONDS);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
        }
        String captured;
        try {
            captured = output.get(2, TimeUnit.SECONDS);
        } catch (Exception exception) {
            captured = "출력을 읽지 못했습니다.";
        }
        return new Execution(finished ? process.exitValue() : -1, !finished, captured);
    }

    private static void destroyProcessTree(Process process) {
        process.descendants().forEach(child -> {
            try {
                child.destroyForcibly();
            } catch (Exception ignored) {
                // 종료 중인 자식 프로세스는 무시합니다.
            }
        });
        process.destroyForcibly();
    }

    private static String readLimited(InputStream stream) {
        try (stream; ByteArrayOutputStream captured = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int total = 0;
            int read;
            while ((read = stream.read(buffer)) != -1) {
                int remaining = MAX_OUTPUT_BYTES - total;
                if (remaining > 0) {
                    int stored = Math.min(read, remaining);
                    captured.write(buffer, 0, stored);
                    total += stored;
                }
            }
            String output = captured.toString(StandardCharsets.UTF_8);
            return total >= MAX_OUTPUT_BYTES ? output + "\n[출력 제한 초과]" : output;
        } catch (IOException exception) {
            return "출력을 읽는 중 오류가 발생했습니다.";
        }
    }

    private static String sanitize(String output, Path work) {
        String clean = output.replace(work.toString(), "<workspace>").strip();
        if (clean.isBlank()) return "실행 중 오류가 발생했습니다.";
        return clean.length() > 8_000 ? clean.substring(0, 8_000) + "\n[이하 생략]" : clean;
    }

    private static String encode(Evaluation evaluation) {
        return evaluation.status() + "\n" + Base64.getEncoder().encodeToString(
                evaluation.details().getBytes(StandardCharsets.UTF_8));
    }

    private static String decodeBase64(String encoded) {
        return new String(Base64.getDecoder().decode(encoded), StandardCharsets.UTF_8);
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private static void deleteRecursively(Path path) {
        try (var paths = Files.walk(path)) {
            paths.sorted(Comparator.reverseOrder()).forEach(item -> {
                try {
                    Files.deleteIfExists(item);
                } catch (IOException ignored) {
                    // 임시 실행 디렉터리는 다음 컨테이너 재시작 때도 제거됩니다.
                }
            });
        } catch (IOException ignored) {
            // 임시 실행 디렉터리는 다음 컨테이너 재시작 때도 제거됩니다.
        }
    }

    record Evaluation(String status, String details) {}
    private record Execution(int exitCode, boolean timedOut, String output) {}
}
