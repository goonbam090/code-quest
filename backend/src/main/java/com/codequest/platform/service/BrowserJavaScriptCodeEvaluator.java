package com.codequest.platform.service;

import com.codequest.platform.model.Problem;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
public class BrowserJavaScriptCodeEvaluator implements JavaScriptCodeEvaluator {
    private static final Logger log = LoggerFactory.getLogger(BrowserJavaScriptCodeEvaluator.class);
    static final Duration RUNNER_REQUEST_TIMEOUT = Duration.ofSeconds(6);
    private final ObjectMapper mapper;
    private final HttpClient client;
    private final URI endpoint;
    private final String runnerToken;

    public BrowserJavaScriptCodeEvaluator(
            ObjectMapper mapper,
            @Value("${codequest.javascript-runner.url:http://localhost:3003}") String runnerUrl,
            @Value("${codequest.javascript-runner.token}") String runnerToken
    ) {
        this.mapper = mapper;
        this.endpoint = URI.create(runnerUrl.replaceAll("/+$", "") + "/evaluate");
        this.runnerToken = runnerToken;
        // Deno.serve는 현재 h2c 업그레이드를 제공하지 않는다. Java HttpClient의 자동
        // HTTP/2 업그레이드를 막아 응답 헤더만 받은 뒤 본문을 기다리는 교착을 피한다.
        this.client = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(2))
                .build();
    }

    @Override
    public Result evaluate(Problem problem, String submittedCode) {
        try {
            ObjectNode payload = buildRequest(problem, submittedCode);
            HttpRequest request = HttpRequest.newBuilder(endpoint)
                    .timeout(RUNNER_REQUEST_TIMEOUT)
                    .header("Content-Type", "application/json; charset=utf-8")
                    .header("X-Code-Quest-Javascript-Runner-Token", runnerToken)
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(payload)))
                    .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200 || response.statusCode() == 400
                    || response.statusCode() == 413) {
                return parseResponse(response.body(), payload);
            }
            log.warn("JavaScript runner returned status {}", response.statusCode());
            return Result.unavailable("JavaScript");
        } catch (IllegalArgumentException exception) {
            log.warn(
                    "Invalid JavaScript judge contract for {}/{}: {}",
                    problem.getCategory(),
                    problem.getNumber(),
                    exception.getMessage()
            );
            return new Result(
                    Status.INVALID_REQUEST,
                    "문제의 JavaScript 테스트 구성이 올바르지 않습니다.",
                    null,
                    null
            );
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return Result.unavailable("JavaScript");
        } catch (Exception exception) {
            log.warn("JavaScript runner is unavailable: {}", exception.getMessage());
            return Result.unavailable("JavaScript");
        }
    }

    ObjectNode buildRequest(Problem problem, String submittedCode) {
        if (problem.getValidationJson() == null || problem.getValidationJson().isBlank()) {
            throw new IllegalArgumentException("required가 없습니다.");
        }
        try {
            JsonNode required = mapper.readTree(problem.getValidationJson());
            String functionName = required.path("functionName").asText();
            if (functionName.isBlank()) {
                throw new IllegalArgumentException("functionName이 없습니다.");
            }
            JsonNode requiredTests = required.path("tests");
            if (!requiredTests.isArray() || requiredTests.isEmpty()) {
                throw new IllegalArgumentException("tests가 없습니다.");
            }

            Map<String, String> publicInputs = publicExamplesByTestId(problem);
            Set<String> testIds = new HashSet<>();
            ObjectNode request = mapper.createObjectNode();
            request.put("source", submittedCode);
            request.put("functionName", functionName);
            String sourceContract = required.path("sourceContract").asText("none");
            request.put("sourceContract", sourceContract.isBlank() ? "none" : sourceContract);
            if (required.hasNonNull("executionContract")) {
                request.set("executionContract", required.get("executionContract").deepCopy());
            }
            ArrayNode tests = request.putArray("tests");
            int index = 0;
            int publicNumber = 0;
            int hiddenNumber = 0;
            for (JsonNode test : requiredTests) {
                index++;
                String testId = test.path("id").asText();
                if (testId.isBlank() || !testIds.add(testId)) {
                    throw new IllegalArgumentException("테스트 id는 비어 있지 않고 고유해야 합니다.");
                }
                if (!test.path("arguments").isArray() || !test.has("expected")) {
                    throw new IllegalArgumentException("arguments와 expected는 JSON 값이어야 합니다.");
                }
                boolean publicCase = publicInputs.containsKey(testId);
                int number = publicCase ? ++publicNumber : ++hiddenNumber;
                String label = test.path("label").asText();
                if (label.isBlank()) label = "테스트 " + index;

                ObjectNode runnerTest = tests.addObject();
                runnerTest.put("id", testId);
                runnerTest.put("visibility", publicCase ? "PUBLIC" : "HIDDEN");
                runnerTest.put("number", number);
                runnerTest.put("label", label);
                runnerTest.put("input", publicCase ? publicInputs.get(testId) : "");
                runnerTest.set("arguments", test.get("arguments").deepCopy());
                runnerTest.set("expected", test.get("expected").deepCopy());
            }
            if (!testIds.containsAll(publicInputs.keySet())) {
                throw new IllegalArgumentException("공개 예제 testId와 일치하는 테스트가 없습니다.");
            }
            return request;
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("required JSON을 해석할 수 없습니다.", exception);
        }
    }

    Result parseResponse(String body, JsonNode requestPayload) {
        try {
            JsonNode response = mapper.readTree(body);
            Status status;
            try {
                status = Status.valueOf(response.path("status").asText());
            } catch (IllegalArgumentException exception) {
                List<String> rootFields = new ArrayList<>();
                response.fieldNames().forEachRemaining(rootFields::add);
                log.warn(
                        "JavaScript runner returned an unknown result status: {}, rootType={}, "
                                + "rootFields={}, bodyLength={}",
                        response.path("status").asText("<missing>"),
                        response.getNodeType(),
                        rootFields,
                        body.length()
                );
                return Result.unavailable("JavaScript");
            }
            String details = response.path("details").asText("채점 결과 설명이 없습니다.");
            Integer errorLine = response.path("errorLine").canConvertToInt()
                    ? response.path("errorLine").intValue()
                    : null;
            JsonNode reportNode = response.path("testReport");
            boolean reportProvided = !reportNode.isMissingNode() && !reportNode.isNull();
            TestReport report = parseTestReport(reportNode, requestPayload.path("tests"));
            if (reportProvided && report == null) {
                log.warn("JavaScript runner returned a test report that did not match the request");
                return Result.unavailable("JavaScript");
            }
            if ((status == Status.PASSED || status == Status.TEST_FAILED) && report == null) {
                log.warn("JavaScript runner returned {} without a valid test report", status);
                return Result.unavailable("JavaScript");
            }
            if (status == Status.PASSED && report.passed() != report.total()) {
                log.warn("JavaScript runner returned PASSED with incomplete tests");
                return Result.unavailable("JavaScript");
            }
            if (status == Status.TEST_FAILED && report.passed() >= report.total()) {
                log.warn("JavaScript runner returned TEST_FAILED although every test passed");
                return Result.unavailable("JavaScript");
            }
            return new Result(status, displayDetails(status, details, report), errorLine, report);
        } catch (Exception exception) {
            log.warn("Could not parse JavaScript runner response: {}", exception.getMessage());
            return Result.unavailable("JavaScript");
        }
    }

    private Map<String, String> publicExamplesByTestId(Problem problem) {
        if (problem.getExamplesJson() == null || problem.getExamplesJson().isBlank()) return Map.of();
        try {
            JsonNode examples = mapper.readTree(problem.getExamplesJson());
            if (!examples.isArray()) {
                throw new IllegalArgumentException("examples는 배열이어야 합니다.");
            }
            Map<String, String> inputs = new LinkedHashMap<>();
            for (JsonNode example : examples) {
                String testId = example.path("testId").asText();
                if (testId.isBlank()
                        || inputs.putIfAbsent(testId, example.path("input").asText("")) != null) {
                    throw new IllegalArgumentException(
                            "공개 예제 testId는 비어 있지 않고 고유해야 합니다.");
                }
            }
            return Map.copyOf(inputs);
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("examples JSON을 해석할 수 없습니다.", exception);
        }
    }

    private TestReport parseTestReport(JsonNode node, JsonNode requestedTests) {
        if (!node.isObject() || !requestedTests.isArray() || requestedTests.isEmpty()) return null;
        Integer passedValue = exactInt(node.path("passed"));
        Integer totalValue = exactInt(node.path("total"));
        Integer publicPassedValue = exactInt(node.path("publicPassed"));
        Integer publicTotalValue = exactInt(node.path("publicTotal"));
        Integer hiddenPassedValue = exactInt(node.path("hiddenPassed"));
        Integer hiddenTotalValue = exactInt(node.path("hiddenTotal"));
        if (passedValue == null || totalValue == null
                || publicPassedValue == null || publicTotalValue == null
                || hiddenPassedValue == null || hiddenTotalValue == null) {
            return null;
        }
        int passed = passedValue;
        int total = totalValue;
        int publicPassed = publicPassedValue;
        int publicTotal = publicTotalValue;
        int hiddenPassed = hiddenPassedValue;
        int hiddenTotal = hiddenTotalValue;
        if (passed < 0 || total <= 0 || publicPassed < 0 || publicTotal < 0
                || hiddenPassed < 0 || hiddenTotal < 0
                || total != publicTotal + hiddenTotal
                || passed != publicPassed + hiddenPassed
                || passed > total || publicPassed > publicTotal || hiddenPassed > hiddenTotal) {
            return null;
        }

        int expectedPublicTotal = 0;
        int expectedHiddenTotal = 0;
        Set<String> requestedIds = new HashSet<>();
        Set<String> requestedCaseKeys = new HashSet<>();
        for (JsonNode requested : requestedTests) {
            String id = requested.path("id").asText();
            String visibility = requested.path("visibility").asText();
            Integer number = exactInt(requested.path("number"));
            if (!requested.isObject()
                    || id.isBlank()
                    || !requestedIds.add(id)
                    || number == null
                    || number <= 0
                    || (!"PUBLIC".equals(visibility) && !"HIDDEN".equals(visibility))
                    || !requestedCaseKeys.add(visibility + ":" + number)
                    || !requested.path("label").isTextual()
                    || !requested.path("input").isTextual()
                    || !requested.has("expected")) {
                return null;
            }
            if ("PUBLIC".equals(visibility)) expectedPublicTotal++;
            else expectedHiddenTotal++;
        }
        if (total != requestedTests.size()
                || publicTotal != expectedPublicTotal
                || hiddenTotal != expectedHiddenTotal) {
            return null;
        }

        List<TestCaseResult> cases = new ArrayList<>();
        int observedPassed = 0;
        int observedPublicPassed = 0;
        int observedPublicTotal = 0;
        int observedHiddenPassed = 0;
        int observedHiddenTotal = 0;
        JsonNode caseNodes = node.path("cases");
        if (!caseNodes.isArray() || caseNodes.size() != requestedTests.size()) return null;
        for (int index = 0; index < caseNodes.size(); index++) {
            JsonNode item = caseNodes.get(index);
            JsonNode requested = requestedTests.get(index);
            if (!item.isObject()) return null;
            String visibility = item.path("visibility").asText();
            String requestedVisibility = requested.path("visibility").asText();
            Integer numberValue = exactInt(item.path("number"));
            int requestedNumber = requested.path("number").intValue();
            String id = item.path("id").asText();
            String requestedId = requested.path("id").asText();
            boolean hidden = "HIDDEN".equals(visibility);
            if (!requestedId.equals(id)
                    || !requestedVisibility.equals(visibility)
                    || numberValue == null
                    || numberValue != requestedNumber
                    || !item.path("passed").isBoolean()) {
                return null;
            }
            boolean casePassed = item.path("passed").asBoolean(false);
            if (casePassed) observedPassed++;
            if (hidden) {
                observedHiddenTotal++;
                if (casePassed) observedHiddenPassed++;
            } else {
                observedPublicTotal++;
                if (casePassed) observedPublicPassed++;
            }
            cases.add(new TestCaseResult(
                    requestedVisibility,
                    requestedNumber,
                    hidden ? "비공개 테스트 " + requestedNumber
                            : requested.path("label").asText(),
                    hidden ? "" : requested.path("input").asText(),
                    hidden ? "" : requested.path("expected").toString(),
                    hidden ? "" : item.path("actual").asText(),
                    hidden ? "" : item.path("error").asText(),
                    casePassed
            ));
        }
        if (observedPassed != passed
                || observedPublicPassed != publicPassed
                || observedPublicTotal != publicTotal
                || observedHiddenPassed != hiddenPassed
                || observedHiddenTotal != hiddenTotal) {
            return null;
        }
        return new TestReport(
                passed, total, publicPassed, publicTotal, hiddenPassed, hiddenTotal, cases
        );
    }

    private Integer exactInt(JsonNode node) {
        return node.isIntegralNumber() && node.canConvertToInt() ? node.intValue() : null;
    }

    private String displayDetails(Status status, String original, TestReport report) {
        if (report == null) return original;
        if (status == Status.PASSED) {
            return "전체 " + report.total() + "개 JavaScript 테스트를 모두 통과했습니다.";
        }
        TestCaseResult failed = report.cases().stream()
                .filter(item -> !item.passed())
                .findFirst()
                .orElse(null);
        if (failed == null) return original;
        if ("PUBLIC".equals(failed.visibility())) {
            if (!failed.error().isBlank()) {
                if (failed.error().startsWith("CONTRACT: ")) {
                    return failed.label() + "에서 " + failed.error().substring("CONTRACT: ".length());
                }
                return failed.label() + " 실행 중 " + failed.error() + " 예외가 발생했습니다.";
            }
            return failed.label() + "에서 결과가 다릅니다."
                    + "\n기대 결과: " + failed.expected()
                    + "\n실행 결과: " + failed.actual();
        }
        return failed.label() + "에서 실패했습니다. 입력과 기대값은 학습을 위해 공개하지 않습니다.";
    }
}
