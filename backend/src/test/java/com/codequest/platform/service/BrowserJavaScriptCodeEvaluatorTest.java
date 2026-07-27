package com.codequest.platform.service;

import com.codequest.platform.model.Problem;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class BrowserJavaScriptCodeEvaluatorTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final BrowserJavaScriptCodeEvaluator evaluator =
            new BrowserJavaScriptCodeEvaluator(
                    mapper,
                    "http://127.0.0.1:1",
                    "javascript-runner-test-token-0123456789"
            );

    @Test
    void buildsTypedTestsAndUsesExampleTestIdForPublicVisibility() {
        Problem problem = problem(
                """
                {
                  "functionName": "solve",
                  "sourceContract": "rest-parameter",
                  "executionContract": {
                    "immutableArguments": [0],
                    "distinctResultFromArguments": [0]
                  },
                  "tests": [
                    {
                      "id": "empty",
                      "label": "빈 배열",
                      "arguments": [[]],
                      "expected": 0
                    },
                    {
                      "id": "mixed",
                      "label": "혼합 값",
                      "arguments": [[3, -2, 5], {"offset": 1}],
                      "expected": {"total": 7, "valid": true}
                    }
                  ]
                }
                """,
                """
                [
                  {
                    "testId": "mixed",
                    "input": "values = [3, -2, 5], options = { offset: 1 }",
                    "output": "{ total: 7, valid: true }"
                  }
                ]
                """
        );

        JsonNode request = evaluator.buildRequest(
                problem,
                "function solve(values, options) { return { total: 7, valid: true }; }"
        );

        assertThat(request.path("functionName").asText()).isEqualTo("solve");
        assertThat(request.path("sourceContract").asText()).isEqualTo("rest-parameter");
        assertThat(request.path("executionContract").path("immutableArguments").get(0).asInt())
                .isZero();
        assertThat(request.path("executionContract")
                .path("distinctResultFromArguments").get(0).asInt()).isZero();
        assertThat(request.path("tests").get(0).path("visibility").asText()).isEqualTo("HIDDEN");
        assertThat(request.path("tests").get(0).path("number").asInt()).isEqualTo(1);
        JsonNode publicTest = request.path("tests").get(1);
        assertThat(publicTest.path("visibility").asText()).isEqualTo("PUBLIC");
        assertThat(publicTest.path("number").asInt()).isEqualTo(1);
        assertThat(publicTest.path("input").asText()).contains("offset");
        assertThat(publicTest.path("arguments").get(0).isArray()).isTrue();
        assertThat(publicTest.path("arguments").get(1).path("offset").asInt()).isEqualTo(1);
        assertThat(publicTest.path("expected").path("valid").asBoolean()).isTrue();
    }

    @Test
    void sendsDedicatedTokenAndParsesJavaScriptErrorLine() throws Exception {
        AtomicReference<String> token = new AtomicReference<>();
        AtomicReference<JsonNode> requestBody = new AtomicReference<>();
        AtomicReference<String> protocol = new AtomicReference<>();
        HttpServer runner = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        runner.createContext("/evaluate", exchange -> {
            protocol.set(exchange.getProtocol());
            token.set(exchange.getRequestHeaders()
                    .getFirst("X-Code-Quest-Javascript-Runner-Token"));
            requestBody.set(mapper.readTree(exchange.getRequestBody()));
            byte[] response = """
                    {
                      "status": "COMPILE_ERROR",
                      "details": "답안:2: 구문 오류",
                      "errorLine": 2,
                      "testReport": null
                    }
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        runner.start();

        try {
            String runnerToken = "dedicated-javascript-runner-token-0123456789";
            BrowserJavaScriptCodeEvaluator httpEvaluator =
                    new BrowserJavaScriptCodeEvaluator(
                            mapper,
                            "http://127.0.0.1:" + runner.getAddress().getPort(),
                            runnerToken
                    );

            CodeExecutionEvaluator.Result result = httpEvaluator.evaluate(
                    problem(
                            """
                            {
                              "functionName": "solve",
                              "tests": [
                                {"id": "basic", "label": "기본", "arguments": [1], "expected": 1}
                              ]
                            }
                            """,
                            "[]"
                    ),
                    "function solve(value) {\n return value;"
            );

            assertThat(result.status()).isEqualTo(CodeExecutionEvaluator.Status.COMPILE_ERROR);
            assertThat(result.errorLine()).isEqualTo(2);
            assertThat(result.testReport()).isNull();
            assertThat(protocol.get()).isEqualTo("HTTP/1.1");
            assertThat(token.get()).isEqualTo(runnerToken);
            assertThat(requestBody.get().path("sourceContract").asText()).isEqualTo("none");
            assertThat(requestBody.get().path("source").asText()).contains("function solve");
        } finally {
            runner.stop(0);
        }
    }

    @Test
    void parsesReportsAndRedactsHiddenValuesAtTheBackendBoundary() {
        ObjectNode request = evaluator.buildRequest(
                problem(
                        """
                        {
                          "functionName": "solve",
                          "tests": [
                            {
                              "id": "public-basic",
                              "label": "매니페스트 공개 예제",
                              "arguments": [1],
                              "expected": 1
                            },
                            {
                              "id": "hidden-boundary",
                              "label": "숨겨진 경계값",
                              "arguments": [999],
                              "expected": 1000
                            }
                          ]
                        }
                        """,
                        """
                        [{"testId": "public-basic", "input": "value = 1", "output": "1"}]
                        """
                ),
                "function solve(value) { return value; }"
        );

        CodeExecutionEvaluator.Result result = evaluator.parseResponse("""
                {
                  "status": "TEST_FAILED",
                  "details": "1/2 테스트를 통과했습니다.",
                  "errorLine": null,
                  "testReport": {
                    "passed": 1,
                    "total": 2,
                    "publicPassed": 1,
                    "publicTotal": 1,
                    "hiddenPassed": 0,
                    "hiddenTotal": 1,
                    "cases": [
                      {
                        "id": "public-basic",
                        "visibility": "PUBLIC",
                        "number": 1,
                        "label": "조작된 공개 라벨",
                        "input": "FORGED_INPUT",
                        "expected": "FORGED_EXPECTED",
                        "actual": "1",
                        "error": "",
                        "passed": true
                      },
                      {
                        "id": "hidden-boundary",
                        "visibility": "HIDDEN",
                        "number": 1,
                        "label": "누출되면 안 되는 라벨",
                        "input": "SECRET_INPUT",
                        "expected": "SECRET_EXPECTED",
                        "actual": "SECRET_ACTUAL",
                        "error": "SECRET_ERROR",
                        "passed": false
                      }
                    ]
                  }
                }
                """, request);

        assertThat(result.status()).isEqualTo(CodeExecutionEvaluator.Status.TEST_FAILED);
        assertThat(result.testReport().passed()).isEqualTo(1);
        assertThat(result.testReport().cases()).hasSize(2);
        CodeExecutionEvaluator.TestCaseResult publicCase = result.testReport().cases().get(0);
        assertThat(publicCase.label()).isEqualTo("매니페스트 공개 예제");
        assertThat(publicCase.input()).isEqualTo("value = 1");
        assertThat(publicCase.expected()).isEqualTo("1");
        assertThat(publicCase.label()).doesNotContain("조작");
        assertThat(publicCase.input()).doesNotContain("FORGED");
        assertThat(publicCase.expected()).doesNotContain("FORGED");
        CodeExecutionEvaluator.TestCaseResult hidden = result.testReport().cases().get(1);
        assertThat(hidden.label()).isEqualTo("비공개 테스트 1");
        assertThat(hidden.input()).isEmpty();
        assertThat(hidden.expected()).isEmpty();
        assertThat(hidden.actual()).isEmpty();
        assertThat(hidden.error()).isEmpty();
        assertThat(result.details()).contains("비공개 테스트 1").doesNotContain("SECRET");
    }

    @Test
    void rejectsPassedResultWhoseCaseReportIsIncomplete() {
        ObjectNode request = twoCaseRequest();
        CodeExecutionEvaluator.Result result = evaluator.parseResponse("""
                {
                  "status": "PASSED",
                  "details": "통과",
                  "errorLine": null,
                  "testReport": {
                    "passed": 2,
                    "total": 2,
                    "publicPassed": 1,
                    "publicTotal": 1,
                    "hiddenPassed": 1,
                    "hiddenTotal": 1,
                    "cases": [
                      {
                        "id": "public-basic",
                        "visibility": "PUBLIC",
                        "number": 1,
                        "label": "공개 예제",
                        "input": "value = 1",
                        "expected": "1",
                        "actual": "1",
                        "error": "",
                        "passed": true
                      }
                    ]
                  }
                }
                """, request);

        assertThat(result.status()).isEqualTo(CodeExecutionEvaluator.Status.UNAVAILABLE);
        assertThat(result.testReport()).isNull();
    }

    @Test
    void rejectsPassedReportsThatDoNotExactlyMatchTheRequestManifest() throws Exception {
        ObjectNode request = twoCaseRequest();
        CodeExecutionEvaluator.Result valid = evaluator.parseResponse(
                mapper.writeValueAsString(validPassedResponse()),
                request
        );
        assertThat(valid.status()).isEqualTo(CodeExecutionEvaluator.Status.PASSED);
        assertThat(valid.testReport().cases()).hasSize(2);

        ObjectNode shrunk = validPassedResponse();
        ArrayNode shrunkCases = (ArrayNode) shrunk.path("testReport").path("cases");
        shrunkCases.remove(1);
        ObjectNode shrunkReport = (ObjectNode) shrunk.path("testReport");
        shrunkReport.put("passed", 1);
        shrunkReport.put("total", 1);
        shrunkReport.put("hiddenPassed", 0);
        shrunkReport.put("hiddenTotal", 0);
        assertUnavailable(shrunk, request);

        ObjectNode idChanged = validPassedResponse();
        ((ObjectNode) idChanged.path("testReport").path("cases").get(0))
                .put("id", "different-public-case");
        assertUnavailable(idChanged, request);

        ObjectNode reordered = validPassedResponse();
        ArrayNode reorderedCases = (ArrayNode) reordered.path("testReport").path("cases");
        JsonNode first = reorderedCases.get(0).deepCopy();
        JsonNode second = reorderedCases.get(1).deepCopy();
        reorderedCases.removeAll();
        reorderedCases.add(second);
        reorderedCases.add(first);
        assertUnavailable(reordered, request);

        ObjectNode visibilityChanged = validPassedResponse();
        ObjectNode changedCase = (ObjectNode) visibilityChanged.path("testReport")
                .path("cases").get(1);
        changedCase.put("visibility", "PUBLIC");
        changedCase.put("number", 2);
        ObjectNode visibilityReport = (ObjectNode) visibilityChanged.path("testReport");
        visibilityReport.put("publicPassed", 2);
        visibilityReport.put("publicTotal", 2);
        visibilityReport.put("hiddenPassed", 0);
        visibilityReport.put("hiddenTotal", 0);
        assertUnavailable(visibilityChanged, request);

        ObjectNode numberChanged = validPassedResponse();
        ((ObjectNode) numberChanged.path("testReport").path("cases").get(1))
                .put("number", 2);
        assertUnavailable(numberChanged, request);

        ObjectNode totalsChanged = validPassedResponse();
        ObjectNode totalsReport = (ObjectNode) totalsChanged.path("testReport");
        totalsReport.put("passed", 3);
        totalsReport.put("total", 3);
        totalsReport.put("hiddenPassed", 2);
        totalsReport.put("hiddenTotal", 2);
        assertUnavailable(totalsChanged, request);
    }

    @Test
    void rejectsAnExampleThatDoesNotReferenceARequiredTest() {
        Problem problem = problem(
                """
                {
                  "functionName": "solve",
                  "tests": [
                    {"id": "basic", "label": "기본", "arguments": [1], "expected": 1}
                  ]
                }
                """,
                """
                [{"testId": "missing", "input": "value = 1", "output": "1"}]
                """
        );

        CodeExecutionEvaluator.Result result =
                evaluator.evaluate(problem, "function solve(value) { return value; }");

        assertThat(result.status()).isEqualTo(CodeExecutionEvaluator.Status.INVALID_REQUEST);
        assertThat(result.details()).contains("테스트 구성");
    }

    private Problem problem(String validationJson, String examplesJson) {
        Problem problem = new Problem();
        problem.setCategory("javascript");
        problem.setNumber(1);
        problem.setMode("javascript");
        problem.setValidationJson(validationJson);
        problem.setExamplesJson(examplesJson);
        return problem;
    }

    private ObjectNode twoCaseRequest() {
        return evaluator.buildRequest(
                problem(
                        """
                        {
                          "functionName": "solve",
                          "tests": [
                            {
                              "id": "public-basic",
                              "label": "공개 예제",
                              "arguments": [1],
                              "expected": 1
                            },
                            {
                              "id": "hidden-boundary",
                              "label": "경계값",
                              "arguments": [999],
                              "expected": 1000
                            }
                          ]
                        }
                        """,
                        """
                        [{"testId": "public-basic", "input": "value = 1", "output": "1"}]
                        """
                ),
                "function solve(value) { return value; }"
        );
    }

    private ObjectNode validPassedResponse() throws Exception {
        return (ObjectNode) mapper.readTree("""
                {
                  "status": "PASSED",
                  "details": "통과",
                  "errorLine": null,
                  "testReport": {
                    "passed": 2,
                    "total": 2,
                    "publicPassed": 1,
                    "publicTotal": 1,
                    "hiddenPassed": 1,
                    "hiddenTotal": 1,
                    "cases": [
                      {
                        "id": "public-basic",
                        "visibility": "PUBLIC",
                        "number": 1,
                        "label": "공개 예제",
                        "input": "value = 1",
                        "expected": "1",
                        "actual": "1",
                        "error": "",
                        "passed": true
                      },
                      {
                        "id": "hidden-boundary",
                        "visibility": "HIDDEN",
                        "number": 1,
                        "label": "비공개 테스트 1",
                        "input": "",
                        "expected": "",
                        "actual": "",
                        "error": "",
                        "passed": true
                      }
                    ]
                  }
                }
                """);
    }

    private void assertUnavailable(ObjectNode response, ObjectNode request) throws Exception {
        CodeExecutionEvaluator.Result result =
                evaluator.parseResponse(mapper.writeValueAsString(response), request);
        assertThat(result.status()).isEqualTo(CodeExecutionEvaluator.Status.UNAVAILABLE);
        assertThat(result.testReport()).isNull();
    }
}
