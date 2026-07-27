package com.codequest.platform.service;

import com.codequest.platform.model.Problem;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class BrowserJavaCodeEvaluatorTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final BrowserJavaCodeEvaluator evaluator =
            new BrowserJavaCodeEvaluator(
                    mapper,
                    "http://localhost:3999",
                    "test-runner-token-that-is-long-enough"
            );

    @Test
    void keepsBackendTimeoutAboveTheRunnerPhaseBudget() {
        assertThat(BrowserJavaCodeEvaluator.RUNNER_REQUEST_TIMEOUT)
                .isEqualTo(Duration.ofSeconds(20))
                .isGreaterThan(Duration.ofSeconds(14));
    }

    @Test void buildsHarnessWithoutExposingReferenceSolution() throws Exception {
        JsonNode validation = mapper.readTree("""
                {
                  "className": "Solution",
                  "methodName": "solve",
                  "tests": [
                    {
                      "id": "sum-positive",
                      "label": "따옴표 \\"포함\\"",
                      "arguments": ["2", "3"],
                      "expected": "5"
                    }
                  ]
                }
                """);

        String harness = evaluator.buildHarness(
                validation, "Solution", Map.of("sum-positive", "a = 2, b = 3")
        );

        assertThat(harness).contains("Solution.solve(2, 3)");
        assertThat(harness).contains(
                "check(\"PUBLIC\", 1, \"따옴표 \\\"포함\\\"\", \"a = 2, b = 3\", 5, \"\", () -> Solution.solve(2, 3))"
        );
        assertThat(harness).contains("Objects.deepEquals(expected, actual)");
        assertThat(harness).contains("__QUEST_TOKEN__");
        assertThat(harness).doesNotContain("return 5");
    }

    @Test void hidesInputsAndExpectedValuesForNonPublicCases() throws Exception {
        JsonNode validation = mapper.readTree("""
                {
                  "tests": [
                    {"id": "boundary", "label": "경계값", "arguments": ["999"], "expected": "1000"}
                  ]
                }
                """);

        String harness = evaluator.buildHarness(validation, "Solution");

        assertThat(harness).contains("check(\"HIDDEN\", 1, \"경계값\", \"\", 1000, \"\"");
        assertThat(harness).contains(
                "? expectedError.isEmpty() ? render(expected) : expectedError : \"\""
        );
    }

    @Test void buildsDirectExpressionAndExpectedExceptionChecks() throws Exception {
        JsonNode validation = mapper.readTree("""
                {
                  "tests": [
                    {
                      "id": "negative-age",
                      "label": "음수 나이",
                      "expression": "new Age(-1).value()",
                      "expectedException": "IllegalArgumentException"
                    }
                  ]
                }
                """);

        String harness = evaluator.buildHarness(
                validation, "Solution", Map.of("negative-age", "new Age(-1)")
        );

        assertThat(harness).contains(
                "check(\"PUBLIC\", 1, \"음수 나이\", \"new Age(-1)\", null, "
                        + "\"IllegalArgumentException\", () -> new Age(-1).value())"
        );
        assertThat(harness).contains("expectedError.equals(actualError)");
    }

    @Test
    void linksPublicExampleToItsExplicitTestIdInsteadOfArrayPosition() throws Exception {
        JsonNode validation = mapper.readTree("""
                {
                  "tests": [
                    {"id": "positive", "label": "양수", "arguments": ["12"], "expected": "\\"positive\\""},
                    {"id": "negative", "label": "음수", "arguments": ["-3"], "expected": "\\"negative\\""}
                  ]
                }
                """);

        String harness = evaluator.buildHarness(
                validation, "Solution", Map.of("negative", "number = -3")
        );

        assertThat(harness).contains(
                "check(\"HIDDEN\", 1, \"양수\", \"\", \"positive\", \"\", () -> Solution.solve(12))"
        );
        assertThat(harness).contains(
                "check(\"PUBLIC\", 1, \"음수\", \"number = -3\", \"negative\", \"\", () -> Solution.solve(-3))"
        );
    }

    @Test
    void carriesSourceContractAsTheFourthProtocolField() throws Exception {
        JsonNode validation = mapper.readTree("""
                {
                  "sourceContract": "insertion-sort",
                  "tests": [
                    {"id": "basic", "label": "기본", "arguments": ["new int[]{}"], "expected": "new int[]{}"}
                  ]
                }
                """);

        String payload = evaluator.buildPayload(
                validation, "Solution", "public class Solution {}", "public class QuestHarness {}"
        );
        String[] fields = payload.split("\\n", 4);

        assertThat(fields).hasSize(4);
        assertThat(fields[0]).isEqualTo("Solution");
        assertThat(decodeProtocolField(fields[1])).isEqualTo("public class Solution {}");
        assertThat(decodeProtocolField(fields[2])).isEqualTo("public class QuestHarness {}");
        assertThat(decodeProtocolField(fields[3])).isEqualTo("insertion-sort");
    }

    @Test
    void parsesSourceContractFailureAcrossTheRunnerHttpBoundary() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        AtomicReference<String> runnerToken = new AtomicReference<>();
        HttpServer runner = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        runner.createContext("/evaluate", exchange -> {
            requestBody.set(new String(
                    exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            runnerToken.set(exchange.getRequestHeaders()
                    .getFirst("X-Code-Quest-Runner-Token"));
            String guidance = "solve(int[]) 본문에 삽입 이동을 직접 작성해 주세요.";
            byte[] response = ("SOURCE_CONTRACT_FAILED\n"
                    + Base64.getEncoder().encodeToString(
                    guidance.getBytes(StandardCharsets.UTF_8)))
                    .getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        runner.start();

        try {
            String token = "source-contract-http-test-runner-token";
            BrowserJavaCodeEvaluator httpEvaluator = new BrowserJavaCodeEvaluator(
                    mapper,
                    "http://127.0.0.1:" + runner.getAddress().getPort(),
                    token
            );
            Problem problem = new Problem();
            problem.setValidationJson("""
                    {
                      "className": "Solution",
                      "methodName": "solve",
                      "sourceContract": "insertion-sort",
                      "tests": [
                        {
                          "id": "basic",
                          "label": "기본",
                          "arguments": ["new int[]{}"],
                          "expected": "new int[]{}"
                        }
                      ]
                    }
                    """);
            problem.setExamplesJson("[]");

            JavaCodeEvaluator.Result result = httpEvaluator.evaluate(
                    problem, "public class Solution {}");

            assertThat(result.status())
                    .isEqualTo(JavaCodeEvaluator.Status.SOURCE_CONTRACT_FAILED);
            assertThat(result.details()).contains("solve(int[])").doesNotContain("return sorted");
            assertThat(result.errorLine()).isNull();
            assertThat(result.testReport()).isNull();
            assertThat(runnerToken.get()).isEqualTo(token);
            String[] fields = requestBody.get().split("\\n", 4);
            assertThat(fields).hasSize(4);
            assertThat(decodeProtocolField(fields[3])).isEqualTo("insertion-sort");
        } finally {
            runner.stop(0);
        }
    }

    private String decodeProtocolField(String encoded) {
        return new String(Base64.getDecoder().decode(encoded), StandardCharsets.UTF_8);
    }
}
