package com.codequest.platform.service;

import com.codequest.platform.dto.ApiDtos.*;
import com.codequest.platform.model.*;
import com.codequest.platform.repository.*;
import org.springframework.stereotype.Service;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@Service
public class ProblemService {
    private static final Set<String> JAVA_BRIDGE_CATEGORIES =
            Set.of("java-bridge", "java-object-core");
    private static final Set<String> JAVA_APPLIED_CATEGORIES =
            Set.of("java-advanced", "java-standard-library", "java-collection-core");

    private final ProblemRepository problems;
    private final LearningProgressRepository progress;
    private final ProgressRecorder progressRecorder;
    private final AnswerValidator validator;
    private final ObjectMapper mapper;

    public ProblemService(ProblemRepository problems, LearningProgressRepository progress,
                          ProgressRecorder progressRecorder, AnswerValidator validator, ObjectMapper mapper) {
        this.problems = problems;
        this.progress = progress;
        this.progressRecorder = progressRecorder;
        this.validator = validator;
        this.mapper = mapper;
    }

    public List<ProblemResponse> list(String category) {
        return problems.findByCategoryOrderByNumber(category).stream().map(this::response).toList();
    }

    public ProblemResponse get(String category, int number) {
        return response(find(category, number));
    }

    public SubmissionResponse submit(String category, int number, SubmissionRequest request) {
        Problem problem = find(category, number);
        AnswerValidator.Evaluation evaluation = validator.evaluate(problem, request.answer());
        String intent = intentExplanation(problem);
        String message = feedbackMessage(problem, evaluation);

        if (!evaluation.countsAsAttempt()) {
            return new SubmissionResponse(false, false, evaluation.status().name(),
                    evaluation.diagnosticCode().name(), message, intent, evaluation.guidance(),
                    evaluation.errorLine(), testReport(evaluation.testReport()), null);
        }

        boolean correct = evaluation.correct();
        ProgressRecorder.AttemptResult attempt = progressRecorder.recordAttempt(
                request.learnerKey(), problem.getId(), correct);
        return new SubmissionResponse(correct, attempt.firstSolve(), evaluation.status().name(),
                evaluation.diagnosticCode().name(), message, intent, evaluation.guidance(),
                evaluation.errorLine(), testReport(evaluation.testReport()),
                correct ? solution(problem) : null);
    }

    public ProgressResponse progress(String learnerKey) {
        List<LearningProgress> rows = progress.findByLearnerKey(learnerKey);
        return new ProgressResponse(learnerKey, rows.stream().filter(LearningProgress::isSolved).count(),
                rows.stream().mapToInt(LearningProgress::getAttempts).sum(),
                rows.stream().filter(LearningProgress::isSolved).map(p -> p.getProblem().getId()).toList());
    }

    private Problem find(String category, int number) {
        return problems.findByCategoryAndNumber(category, number)
                .orElseThrow(() -> new ProblemNotFoundException(category, number));
    }

    private ProblemResponse response(Problem p) {
        return new ProblemResponse(p.getId(), p.getCategory(), p.getNumber(), p.getMode(), p.getStage(),
                p.getTitle(), p.getQuestion(), publicHtml(p), p.getStarterCode(), examples(p),
                textList(p.getConstraintsJson()), p.getHints(), learning(p));
    }

    private String publicHtml(Problem problem) {
        if (!"selector".equals(problem.getMode())) {
            return problem.getHtml();
        }
        return SelectorIntentMatcher.withoutInternalTargetMarkers(problem.getHtml());
    }

    private String intentExplanation(Problem problem) {
        String basis = "출제 의도: " + problem.getQuestion();
        if ("selector".equals(problem.getMode())) {
            return basis + " 예시 선택자 문자열을 외우는 것이 아니라 목표 요소 집합을 정확히 선택하는지를 확인합니다.";
        }
        if ("html".equals(problem.getMode())) {
            return basis + " 예시 마크업 문자열이 아니라 시맨틱 태그 구조, 속성 연결, 접근성 계약을 충족하는지 확인합니다.";
        }
        if (JAVA_BRIDGE_CATEGORIES.contains(problem.getCategory())) {
            return basis + " 기본 문법을 외우는 데서 그치지 않고 타입 변환, 메서드 계약, 객체 상태와 컬렉션 경계를 연결하는지 확인합니다.";
        }
        if (JAVA_APPLIED_CATEGORIES.contains(problem.getCategory())) {
            return basis + " 기준 답안 문자열이 아니라 Java 21 컴파일 결과, 요구된 클래스·인터페이스의 동작, "
                    + "Object·예외·컬렉션 계약과 여러 입력 테스트로 응용 설계를 확인합니다.";
        }
        if ("java".equals(problem.getMode())) {
            return basis + " 예시 코드와 문자열이 같은지가 아니라 Java 21 컴파일 결과와 여러 입력 테스트로 기본 문법을 확인합니다.";
        }
        if ("algorithm".equals(problem.getMode())) {
            return basis + ("algorithm-intermediate".equals(problem.getCategory())
                    ? " 재귀 상태, 그래프 모델, 그리디 근거 또는 동적 계획법 점화식을 세우고 여러 경계값을 통과하는지 확인합니다."
                    : " 특정 풀이를 외우는 것이 아니라 여러 입력과 경계값 테스트를 모두 통과하는 알고리즘을 확인합니다.");
        }
        if ("javascript".equals(problem.getMode())) {
            return basis + " 예시 코드 문자열이 아니라 JavaScript 함수의 실행 결과와 여러 입력·경계값 테스트로 "
                    + "기본 문법과 문제 해결 과정을 확인합니다.";
        }
        return basis + " 정답 문자열을 외우는 것이 아니라 실제 브라우저의 계산 스타일과 화면 결과로 요구 상태를 구현하는지를 확인합니다.";
    }

    private List<ExampleResponse> examples(Problem problem) {
        if (problem.getExamplesJson() == null || problem.getExamplesJson().isBlank()) return List.of();
        try {
            List<ExampleResponse> result = new ArrayList<>();
            for (JsonNode example : mapper.readTree(problem.getExamplesJson())) {
                result.add(new ExampleResponse(
                        example.path("input").asText(),
                        example.path("output").asText(),
                        trace(example.path("trace"))
                ));
            }
            return result;
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private LearningContentResponse learning(Problem problem) {
        if (problem.getLearningJson() == null || problem.getLearningJson().isBlank()) return null;
        try {
            JsonNode node = mapper.readTree(problem.getLearningJson());
            if (!isValidLearning(node)) return null;
            JsonNode example = node.path("example");
            List<LearningApplicationResponse> applications = new ArrayList<>();
            for (JsonNode application : node.path("applications")) {
                applications.add(new LearningApplicationResponse(
                        application.path("title").asText(),
                        application.path("description").asText(),
                        application.path("code").asText()
                ));
            }
            return new LearningContentResponse(
                    textList(node.path("keywords")),
                    node.path("summary").asText(),
                    new LearningExampleResponse(
                            example.path("code").asText(),
                            example.path("explanation").asText()
                    ),
                    textList(node.path("principles")),
                    applications,
                    textList(node.path("pitfalls"))
            );
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean isValidLearning(JsonNode node) {
        if (node == null || !node.isObject()
                || !isTextArray(node.path("keywords"), 2, 4)
                || !isNonBlankText(node.path("summary"))
                || !node.path("example").isObject()
                || !isNonBlankText(node.path("example").path("code"))
                || !isNonBlankText(node.path("example").path("explanation"))
                || !isTextArray(node.path("principles"), 2, 4)
                || !node.path("applications").isArray()
                || node.path("applications").isEmpty()
                || !isTextArray(node.path("pitfalls"), 1, 3)) {
            return false;
        }
        for (JsonNode application : node.path("applications")) {
            if (!application.isObject()
                    || !isNonBlankText(application.path("title"))
                    || !isNonBlankText(application.path("description"))
                    || !isNonBlankText(application.path("code"))) {
                return false;
            }
        }
        return true;
    }

    private boolean isTextArray(JsonNode node, int minimum, int maximum) {
        if (!node.isArray() || node.size() < minimum || node.size() > maximum) return false;
        for (JsonNode item : node) {
            if (!isNonBlankText(item)) return false;
        }
        return true;
    }

    private boolean isNonBlankText(JsonNode node) {
        return node.isTextual() && !node.asText().isBlank();
    }

    private List<TraceStepResponse> trace(JsonNode trace) {
        if (!trace.isArray()) return List.of();
        List<TraceStepResponse> result = new ArrayList<>();
        for (JsonNode step : trace) {
            result.add(new TraceStepResponse(
                    step.path("label").asText(),
                    step.path("state").asText(),
                    step.path("detail").asText()
            ));
        }
        return result;
    }

    private List<String> textList(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            List<String> result = new ArrayList<>();
            mapper.readTree(json).forEach(item -> result.add(item.asText()));
            return result;
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private List<String> textList(JsonNode node) {
        if (!node.isArray()) return List.of();
        List<String> result = new ArrayList<>();
        node.forEach(item -> result.add(item.asText()));
        return result;
    }

    private TestReportResponse testReport(CodeExecutionEvaluator.TestReport report) {
        if (report == null) return null;
        List<TestCaseResponse> cases = report.cases().stream()
                .map(item -> new TestCaseResponse(
                        item.visibility(), item.number(), item.label(), item.input(),
                        item.expected(), item.actual(), item.error(), item.passed()
                ))
                .toList();
        return new TestReportResponse(
                report.passed(), report.total(),
                report.publicPassed(), report.publicTotal(),
                report.hiddenPassed(), report.hiddenTotal(),
                cases
        );
    }

    private SolutionLessonResponse solution(Problem problem) {
        if (problem.getSolutionJson() != null && !problem.getSolutionJson().isBlank()) {
            try {
                JsonNode node = mapper.readTree(problem.getSolutionJson());
                List<String> keyPoints = new ArrayList<>();
                node.path("keyPoints").forEach(item -> keyPoints.add(item.asText()));
                return new SolutionLessonResponse(
                        node.path("summary").asText(defaultSummary(problem)),
                        keyPoints.isEmpty() ? defaultKeyPoints(problem) : keyPoints,
                        node.path("alternative").asText(defaultAlternative(problem)),
                        node.path("complexity").asText(defaultComplexity(problem)),
                        referenceAnswer(problem),
                        selectorBreakdown(node.path("selectorBreakdown"))
                );
            } catch (Exception ignored) {
                // 손상된 선택 해설은 안전한 기본 해설로 대체합니다.
            }
        }
        return new SolutionLessonResponse(
                defaultSummary(problem),
                defaultKeyPoints(problem),
                defaultAlternative(problem),
                defaultComplexity(problem),
                referenceAnswer(problem),
                List.of()
        );
    }

    private String referenceAnswer(Problem problem) {
        return "selector".equals(problem.getMode()) ? problem.getAnswer() : null;
    }

    private List<SelectorBreakdownResponse> selectorBreakdown(JsonNode node) {
        if (!node.isArray()) return List.of();
        List<SelectorBreakdownResponse> result = new ArrayList<>();
        for (JsonNode item : node) {
            String fragment = item.path("fragment").asText();
            String explanation = item.path("explanation").asText();
            if (!fragment.isBlank() && !explanation.isBlank()) {
                result.add(new SelectorBreakdownResponse(fragment, explanation));
            }
        }
        return result;
    }

    private String defaultSummary(Problem problem) {
        if ("selector".equals(problem.getMode())) {
            return "선택자의 조건을 왼쪽부터 읽으며 목표 요소까지 범위를 좁혀 보세요.";
        }
        return "문제의 각 조건을 코드의 구조나 선언으로 나눈 뒤 모두 충족하면 출제 의도에 맞는 풀이가 됩니다.";
    }

    private List<String> defaultKeyPoints(Problem problem) {
        List<String> points = problem.getHints().stream()
                .filter(hint -> !hint.startsWith("비슷한 코드"))
                .limit(2)
                .toList();
        return points.isEmpty() ? List.of(problem.getQuestion()) : points;
    }

    private String defaultAlternative(Problem problem) {
        return switch (problem.getMode()) {
            case "selector" -> "같은 목표 요소 집합만 선택한다면 더 짧거나 더 명시적인 선택자도 가능합니다.";
            case "html" -> "같은 시맨틱 구조와 접근성 연결을 유지한다면 텍스트와 주변 래퍼는 다르게 구성할 수 있습니다.";
            case "java" -> "반복문·컬렉션·표준 메서드 중 문제의 입력 범위에 맞는 다른 구현도 테스트를 통과하면 정답입니다.";
            case "algorithm" -> "같은 복잡도 안에서 다른 자료구조나 탐색 순서를 사용해도 모든 경계값을 통과하면 정답입니다.";
            case "javascript" -> "반복문·배열 메서드·Map과 Set 등 다른 JavaScript 표현도 모든 테스트를 통과하면 정답입니다.";
            default -> "브라우저의 계산 스타일과 최종 배치가 같다면 축약형·논리 속성 등 다른 CSS 표현도 가능합니다.";
        };
    }

    private String defaultComplexity(Problem problem) {
        if ("algorithm".equals(problem.getCategory())) {
            return switch (problem.getNumber()) {
                case 1 -> "원소 수 n에 대해 모든 쌍을 확인하므로 시간 O(n²), 추가 공간 O(1)";
                case 2 -> "원소 수 n에 대해 모든 세 원소 조합을 확인하므로 시간 O(n³), 추가 공간 O(1)";
                case 3 -> "문자열 길이 n에 대해 시간 O(n), 마지막 위치 Map 공간 O(k)";
                case 4 -> "입력값 n의 제곱근까지만 약수를 확인하므로 시간 O(√n), 추가 공간 O(1)";
                case 5 -> "원소 수 n에 대해 빈도 계산 O(n)과 정렬 O(n log n), 결과 포함 공간 O(n)";
                case 6 -> "문자열 길이 n에 대해 정렬 시간 O(n log n), 변환 배열 공간 O(n)";
                case 7 -> "배열 길이 n에 대해 시간 O(n), 결과 배열 공간 O(n)";
                case 8 -> "배열 길이 n에 대해 시간 O(n), 추가 공간 O(1)";
                case 9 -> "두 배열 길이 n과 m, 공통값 수 k에 대해 시간 O(n+m log k), Set 공간 O(n+k)";
                case 10 -> "문자열 길이 n에 대해 시간 O(n), 결과 문자열 공간 O(n)";
                case 11 -> "정렬 배열 길이 n에 대해 시간 O(log n), 추가 공간 O(1)";
                case 12 -> "두 배열 길이 n과 m에 대해 시간 O(n+m), 결과 배열 공간 O(n+m)";
                case 13 -> "배열 길이 n에 대해 정렬 시간 O(n log n), 복사 배열 공간 O(n)";
                case 14 -> "정렬 배열 길이 n에 대해 시간 O(log n), 추가 공간 O(1)";
                case 15 -> "배열 길이 n에 대해 최악 시간 O(n²), 추가 공간 O(1)";
                case 16, 17 -> "원소 수 n에 대해 시간 O(n), 스택 공간 O(n)";
                case 18 -> "배열 길이 n에 대해 누적합 구성 시간 O(n), 한 구간 질의 O(1), 공간 O(n)";
                case 19 -> "배열 길이 n에 대해 시간 O(n), 추가 공간 O(1)";
                case 20 -> "배열 길이 n에 대해 평균 시간 O(n), 해시 Set 공간 O(n)";
                default -> "입력 제한과 반복문 중첩 수를 기준으로 시간·공간 복잡도를 확인하세요.";
            };
        }
        return switch (problem.getMode()) {
            case "algorithm" -> "입력 제한과 반복문 중첩 수를 기준으로 시간 복잡도를, 추가 배열·컬렉션 크기로 공간 복잡도를 확인하세요.";
            case "java" -> "이 문제는 문법·설계 연습이 중심입니다. 컬렉션을 순회한다면 일반적으로 원소 수 n에 비례하는 비용이 듭니다.";
            case "javascript" -> "입력 크기 n에 대한 반복 횟수와 새 배열·Map·Set의 크기를 기준으로 시간·공간 복잡도를 확인하세요.";
            default -> "실행 복잡도보다 올바른 DOM 구조와 브라우저 렌더링 결과가 핵심인 문제입니다.";
        };
    }

    private String feedbackMessage(Problem problem, AnswerValidator.Evaluation evaluation) {
        return switch (evaluation.diagnosticCode()) {
            case PROPERTY_NAME_TYPO -> "오답으로 처리하지 않았습니다. 속성명 오타 가능성이 높아요.";
            case UNKNOWN_PROPERTY -> "오답으로 처리하지 않았습니다. 알 수 없는 CSS 속성이 있어요.";
            case INVALID_PROPERTY_VALUE -> "오답으로 처리하지 않았습니다. 브라우저가 지원하지 않는 값이에요.";
            case MISSING_UNIT -> "오답으로 처리하지 않았습니다. CSS 단위가 빠진 것 같아요.";
            case INPUT_TOO_LARGE -> "오답으로 처리하지 않았습니다. CSS 답안 길이 제한을 확인해 주세요.";
            case RENDER_LIMIT -> "오답으로 처리하지 않았습니다. CSS 렌더링 크기 제한을 확인해 주세요.";
            case UNBALANCED_DELIMITER -> "오답으로 처리하지 않았습니다. 괄호나 따옴표의 짝을 확인해 주세요.";
            case MALFORMED_DECLARATION -> "오답으로 처리하지 않았습니다. CSS 선언 형식을 확인해 주세요.";
            case HTML_SYNTAX -> "오답으로 처리하지 않았습니다. HTML 문법을 먼저 확인해 주세요.";
            case HTML_UNSAFE_CONTENT -> "오답으로 처리하지 않았습니다. 안전하지 않은 HTML 요소나 속성이 있어요.";
            case HTML_STRUCTURE_MISMATCH -> "HTML 문법은 맞지만 필요한 시맨틱 구조가 부족해요.";
            case MISSING_REQUIRED_PROPERTY -> "필요한 CSS 선언이 빠져 있어요.";
            case VALUE_MISMATCH -> "CSS 값은 유효하지만 문제의 목표값과 달라요.";
            case RESULT_MISMATCH -> "CSS 문법은 맞지만 최종 화면이 문제의 목표와 달라요.";
            case COMPILE_ERROR -> "javascript".equals(problem.getMode())
                    ? "오답으로 처리하지 않았습니다. JavaScript 문법 오류가 있어요."
                    : "오답으로 처리하지 않았습니다. Java 컴파일 오류가 있어요.";
            case FORBIDDEN_API -> "오답으로 처리하지 않았습니다. 실행 환경에서 허용하지 않는 API가 있어요.";
            case SOURCE_CONTRACT -> "javascript".equals(problem.getMode())
                    ? "코드는 해석되지만 문제에서 요구한 문법 구조와 달라요."
                    : "컴파일은 통과했지만 문제에서 요구한 알고리즘 구조와 달라요.";
            case TEST_FAILURE -> "코드는 실행됐지만 통과하지 못한 테스트가 있어요.";
            case RUNTIME_ERROR -> "코드 실행 중 예외가 발생했어요.";
            case TIME_LIMIT -> "코드가 제한 시간 안에 끝나지 않았어요.";
            case JUDGE_UNAVAILABLE -> "채점 서비스를 잠시 사용할 수 없어요.";
            default -> switch (evaluation.status()) {
                case CORRECT -> "정답입니다.";
                case EMPTY -> "아직 답안이 입력되지 않았어요.";
                case TYPO -> "오답으로 처리하지 않았습니다. 오타 가능성이 높아요.";
                case SYNTAX -> "오답으로 처리하지 않았습니다. CSS 문법을 먼저 확인해 주세요.";
                case INCORRECT -> "아직 출제 의도와 결과가 일치하지 않습니다.";
                case ERROR -> "채점 서비스를 잠시 사용할 수 없습니다.";
            };
        };
    }
}
