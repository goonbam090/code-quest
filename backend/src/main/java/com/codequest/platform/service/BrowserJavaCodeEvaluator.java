package com.codequest.platform.service;

import com.codequest.platform.model.Problem;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.time.Duration;
import java.util.Base64;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class BrowserJavaCodeEvaluator implements JavaCodeEvaluator {
    private static final Logger log = LoggerFactory.getLogger(BrowserJavaCodeEvaluator.class);
    static final Duration RUNNER_REQUEST_TIMEOUT = Duration.ofSeconds(20);
    private final ObjectMapper mapper;
    private final HttpClient client;
    private final URI endpoint;
    private final String runnerToken;

    public BrowserJavaCodeEvaluator(
            ObjectMapper mapper,
            @Value("${codequest.java-runner.url:http://localhost:3002}") String runnerUrl,
            @Value("${codequest.java-runner.token}") String runnerToken
    ) {
        this.mapper = mapper;
        this.endpoint = URI.create(runnerUrl.replaceAll("/+$", "") + "/evaluate");
        this.runnerToken = runnerToken;
        this.client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    }

    @Override
    public Result evaluate(Problem problem, String submittedCode) {
        try {
            JsonNode validation = mapper.readTree(problem.getValidationJson());
            String className = validation.path("className").asText("Solution");
            String harness = buildHarness(validation, className, publicExamplesByTestId(problem));
            String payload = buildPayload(validation, className, submittedCode, harness);
            HttpRequest request = HttpRequest.newBuilder(endpoint)
                    .timeout(RUNNER_REQUEST_TIMEOUT)
                    .header("Content-Type", "text/plain; charset=utf-8")
                    .header("X-Code-Quest-Runner-Token", runnerToken)
                    .POST(HttpRequest.BodyPublishers.ofString(payload))
                    .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("Java runner returned status {}: {}", response.statusCode(), response.body());
                return Result.unavailable("Java");
            }
            String[] parts = response.body().split("\\n", 2);
            Status status;
            try {
                status = Status.valueOf(parts[0].trim());
            } catch (IllegalArgumentException exception) {
                status = Status.UNAVAILABLE;
            }
            String details = parts.length == 2 ? decode(parts[1].trim()) : "채점 결과 설명이 없습니다.";
            TestReport report = parseTestReport(details);
            Integer errorLine = status == Status.COMPILE_ERROR ? compileErrorLine(details, className) : null;
            return new Result(status, displayDetails(status, details, report), errorLine, report);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return Result.unavailable("Java");
        } catch (Exception exception) {
            log.warn("Java runner is unavailable: {}", exception.getMessage());
            return Result.unavailable("Java");
        }
    }

    String buildHarness(JsonNode validation, String className) {
        return buildHarness(validation, className, Map.of());
    }

    String buildPayload(JsonNode validation, String className, String submittedCode, String harness) {
        String sourceContract = validation.path("sourceContract").asText("none");
        if (sourceContract.isBlank()) sourceContract = "none";
        return className + "\n"
                + encode(submittedCode) + "\n"
                + encode(harness) + "\n"
                + encode(sourceContract);
    }

    String buildHarness(JsonNode validation, String className, Map<String, String> publicInputsByTestId) {
        String methodName = validation.path("methodName").asText("solve");
        StringBuilder tests = new StringBuilder();
        int index = 0;
        int publicIndex = 0;
        int hiddenIndex = 0;
        Set<String> testIds = new HashSet<>();
        for (JsonNode test : validation.path("tests")) {
            index++;
            String testId = test.path("id").asText();
            if (testId.isBlank() || !testIds.add(testId)) {
                throw new IllegalArgumentException("Java 테스트 id는 비어 있지 않고 고유해야 합니다.");
            }
            StringBuilder arguments = new StringBuilder();
            int argumentIndex = 0;
            for (JsonNode argument : test.path("arguments")) {
                if (argumentIndex++ > 0) arguments.append(", ");
                arguments.append(argument.asText());
            }
            String expectedException = test.path("expectedException").asText("");
            String expected = expectedException.isBlank() ? test.path("expected").asText() : "null";
            String label = javaString(test.path("label").asText("테스트 " + index));
            boolean publicCase = publicInputsByTestId.containsKey(testId);
            int visibleIndex = publicCase ? ++publicIndex : ++hiddenIndex;
            String input = publicCase ? publicInputsByTestId.get(testId) : "";
            String expression = test.path("expression").asText("");
            if (expression.isBlank()) {
                expression = className + "." + methodName + "(" + arguments + ")";
            }
            tests.append("    check(\"").append(publicCase ? "PUBLIC" : "HIDDEN")
                    .append("\", ").append(visibleIndex)
                    .append(", \"").append(label)
                    .append("\", \"").append(javaString(input))
                    .append("\", ").append(expected)
                    .append(", \"").append(javaString(expectedException))
                    .append("\", () -> ").append(expression).append(");\n");
        }
        if (index == 0) throw new IllegalArgumentException("Java 문제에 테스트가 없습니다.");

        return """
                import java.lang.reflect.Array;
                import java.nio.charset.StandardCharsets;
                import java.util.Base64;
                import java.util.List;
                import java.util.Map;
                import java.util.Objects;
                import java.util.Optional;
                import java.util.OptionalInt;

                public final class QuestHarness {
                  @FunctionalInterface
                  private interface CheckedCall {
                    Object run() throws Throwable;
                  }

                  private static int passed;
                  private static int total;
                  private static int publicPassed;
                  private static int publicTotal;
                  private static int hiddenPassed;
                  private static int hiddenTotal;

                  private static String encode(String value) {
                    return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
                  }

                  private static String render(Object value) {
                    if (value == null) return "null";
                    if (!value.getClass().isArray()) return String.valueOf(value);
                    int length = Array.getLength(value);
                    StringBuilder result = new StringBuilder("[");
                    for (int index = 0; index < length; index++) {
                      if (index > 0) result.append(", ");
                      result.append(render(Array.get(value, index)));
                    }
                    return result.append("]").toString();
                  }

                  private static void emit(String visibility, int number, String outcome,
                                           String label, String input, String expected,
                                           String actual, String error) {
                    System.out.println("__QUEST_TOKEN__\\tCASE\\t" + visibility + "\\t" + number + "\\t" + outcome
                        + "\\t" + encode(label) + "\\t" + encode(input) + "\\t" + encode(expected)
                        + "\\t" + encode(actual) + "\\t" + encode(error));
                  }

                  private static void check(String visibility, int number, String label, String input,
                                            Object expected, String expectedError, CheckedCall call) {
                    total++;
                    if ("PUBLIC".equals(visibility)) publicTotal++; else hiddenTotal++;
                    String visibleLabel = "PUBLIC".equals(visibility) ? label : "비공개 테스트 " + number;
                    try {
                      Object actual = call.run();
                      boolean matched = expectedError.isEmpty() && Objects.deepEquals(expected, actual);
                      if (matched) {
                        passed++;
                        if ("PUBLIC".equals(visibility)) publicPassed++; else hiddenPassed++;
                      }
                      emit(visibility, number, matched ? "PASSED" : "FAILED", visibleLabel,
                          "PUBLIC".equals(visibility) ? input : "",
                          "PUBLIC".equals(visibility)
                              ? expectedError.isEmpty() ? render(expected) : expectedError : "",
                          "PUBLIC".equals(visibility)
                              ? expectedError.isEmpty() ? render(actual) : "예외 없음" : "", "");
                    } catch (Throwable throwable) {
                      String actualError = throwable.getClass().getSimpleName();
                      boolean matched = expectedError.equals(actualError)
                          || expectedError.equals(throwable.getClass().getName());
                      if (matched) {
                        passed++;
                        if ("PUBLIC".equals(visibility)) publicPassed++; else hiddenPassed++;
                        emit(visibility, number, "PASSED", visibleLabel,
                            "PUBLIC".equals(visibility) ? input : "",
                            "PUBLIC".equals(visibility) ? expectedError : "",
                            "PUBLIC".equals(visibility) ? actualError : "", "");
                      } else {
                        String error = actualError;
                        if ("PUBLIC".equals(visibility) && throwable.getMessage() != null) {
                          error += ": " + throwable.getMessage();
                        }
                        emit(visibility, number, "ERROR", visibleLabel,
                            "PUBLIC".equals(visibility) ? input : "",
                            "PUBLIC".equals(visibility)
                                ? expectedError.isEmpty() ? render(expected) : expectedError : "",
                            "", error);
                      }
                    }
                  }

                  public static void main(String[] args) throws Exception {
                """ + tests + """
                    System.out.println("__QUEST_TOKEN__\\tSUMMARY\\t" + passed + "\\t" + total
                        + "\\t" + publicPassed + "\\t" + publicTotal
                        + "\\t" + hiddenPassed + "\\t" + hiddenTotal);
                  }
                }
                """;
    }

    private Map<String, String> publicExamplesByTestId(Problem problem) {
        if (problem.getExamplesJson() == null || problem.getExamplesJson().isBlank()) return Map.of();
        try {
            Map<String, String> inputs = new LinkedHashMap<>();
            for (JsonNode example : mapper.readTree(problem.getExamplesJson())) {
                String testId = example.path("testId").asText();
                if (testId.isBlank() || inputs.putIfAbsent(testId, example.path("input").asText("")) != null) {
                    throw new IllegalArgumentException("공개 예제 testId는 비어 있지 않고 고유해야 합니다.");
                }
            }
            return Map.copyOf(inputs);
        } catch (Exception ignored) {
            return Map.of();
        }
    }

    private TestReport parseTestReport(String details) {
        List<TestCaseResult> cases = new ArrayList<>();
        int passed = -1;
        int total = -1;
        int publicPassed = 0;
        int publicTotal = 0;
        int hiddenPassed = 0;
        int hiddenTotal = 0;

        for (String line : details.split("\\R")) {
            String[] fields = line.split("\\t", -1);
            if (fields.length == 9 && "CASE".equals(fields[0])) {
                try {
                    cases.add(new TestCaseResult(
                            fields[1],
                            Integer.parseInt(fields[2]),
                            decode(fields[4]),
                            decode(fields[5]),
                            decode(fields[6]),
                            decode(fields[7]),
                            decode(fields[8]),
                            "PASSED".equals(fields[3])
                    ));
                } catch (Exception ignored) {
                    // 손상된 개별 결과는 전체 채점 결과에서 제외합니다.
                }
            }
            if (fields.length == 7 && "SUMMARY".equals(fields[0])) {
                try {
                    passed = Integer.parseInt(fields[1]);
                    total = Integer.parseInt(fields[2]);
                    publicPassed = Integer.parseInt(fields[3]);
                    publicTotal = Integer.parseInt(fields[4]);
                    hiddenPassed = Integer.parseInt(fields[5]);
                    hiddenTotal = Integer.parseInt(fields[6]);
                } catch (NumberFormatException ignored) {
                    passed = -1;
                    total = -1;
                }
            }
        }
        if (passed < 0 || total < 0) return null;
        return new TestReport(
                passed, total, publicPassed, publicTotal, hiddenPassed, hiddenTotal, List.copyOf(cases)
        );
    }

    private Integer compileErrorLine(String details, String className) {
        Matcher matcher = Pattern.compile(
                "(?:^|[/\\\\])" + Pattern.quote(className) + "\\.java:(\\d+):",
                Pattern.MULTILINE
        ).matcher(details);
        return matcher.find() ? Integer.parseInt(matcher.group(1)) : null;
    }

    private String displayDetails(Status status, String original, TestReport report) {
        if (report == null) return original;
        if (status == Status.PASSED) {
            return "전체 " + report.total() + "개 테스트를 모두 통과했습니다.";
        }
        TestCaseResult failed = report.cases().stream().filter(item -> !item.passed()).findFirst().orElse(null);
        if (failed == null) return original;
        if ("PUBLIC".equals(failed.visibility())) {
            if (!failed.error().isBlank()) {
                return failed.label() + " 실행 중 " + failed.error() + " 예외가 발생했습니다.";
            }
            return failed.label() + "에서 결과가 다릅니다."
                    + "\n기대 결과: " + failed.expected()
                    + "\n실행 결과: " + failed.actual();
        }
        return failed.label() + "에서 실패했습니다. 입력과 기대값은 학습을 위해 공개하지 않습니다.";
    }

    private String javaString(String value) {
        return value.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\r", "\\r")
                .replace("\n", "\\n");
    }

    private String encode(String value) {
        return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private String decode(String value) {
        return new String(Base64.getDecoder().decode(value), StandardCharsets.UTF_8);
    }
}
