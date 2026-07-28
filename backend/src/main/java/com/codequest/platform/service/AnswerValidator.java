package com.codequest.platform.service;

import com.codequest.platform.model.Problem;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class AnswerValidator {
    private static final int MAX_CSS_ANSWER_LENGTH = 20_000;
    private static final Pattern DECLARATION = Pattern.compile("([\\w-]+)\\s*:\\s*([^;{}]+)");
    private static final Pattern ZERO_WITH_UNIT = Pattern.compile("(?<![\\w.])-?0(?:px|rem|em|vh|vw|dvh|svh|lvh|%|fr|ms|s|deg)(?![\\w-])");
    private static final Pattern LEADING_DECIMAL = Pattern.compile("(?<![\\w.])(-?)\\.(\\d+)");
    private final SelectorIntentMatcher selectorIntentMatcher = new SelectorIntentMatcher();
    private final HtmlIntentMatcher htmlIntentMatcher = new HtmlIntentMatcher();
    private final CssRenderingEvaluator cssRenderingEvaluator;
    private final JavaCodeEvaluator javaCodeEvaluator;
    private final JavaScriptCodeEvaluator javaScriptCodeEvaluator;

    public AnswerValidator(
            CssRenderingEvaluator cssRenderingEvaluator,
            JavaCodeEvaluator javaCodeEvaluator,
            JavaScriptCodeEvaluator javaScriptCodeEvaluator
    ) {
        this.cssRenderingEvaluator = cssRenderingEvaluator;
        this.javaCodeEvaluator = javaCodeEvaluator;
        this.javaScriptCodeEvaluator = javaScriptCodeEvaluator;
    }

    public enum Status {
        CORRECT,
        EMPTY,
        TYPO,
        SYNTAX,
        INCORRECT,
        ERROR
    }

    public enum DiagnosticCode {
        NONE,
        EMPTY_ANSWER,
        SELECTOR_TYPO,
        SELECTOR_SYNTAX,
        SELECTOR_MISMATCH,
        HTML_SYNTAX,
        HTML_STRUCTURE_MISMATCH,
        HTML_UNSAFE_CONTENT,
        PROPERTY_NAME_TYPO,
        UNKNOWN_PROPERTY,
        INVALID_PROPERTY_VALUE,
        MISSING_UNIT,
        FORBIDDEN_RESOURCE,
        INPUT_TOO_LARGE,
        RENDER_LIMIT,
        UNBALANCED_DELIMITER,
        MALFORMED_DECLARATION,
        MISSING_REQUIRED_PROPERTY,
        VALUE_MISMATCH,
        RESULT_MISMATCH,
        COMPILE_ERROR,
        FORBIDDEN_API,
        SOURCE_CONTRACT,
        TEST_FAILURE,
        RUNTIME_ERROR,
        TIME_LIMIT,
        JUDGE_UNAVAILABLE
    }

    public record Evaluation(Status status, boolean exactMatch, DiagnosticCode diagnosticCode,
                             String guidance, Integer errorLine,
                             CodeExecutionEvaluator.TestReport testReport) {
        public Evaluation(Status status, boolean exactMatch, DiagnosticCode diagnosticCode,
                          String guidance) {
            this(status, exactMatch, diagnosticCode, guidance, null, null);
        }

        public Evaluation(Status status, boolean exactMatch, String guidance) {
            this(status, exactMatch, switch (status) {
                case CORRECT -> DiagnosticCode.NONE;
                case EMPTY -> DiagnosticCode.EMPTY_ANSWER;
                case TYPO -> DiagnosticCode.SELECTOR_TYPO;
                case SYNTAX -> DiagnosticCode.SELECTOR_SYNTAX;
                case INCORRECT -> DiagnosticCode.SELECTOR_MISMATCH;
                case ERROR -> DiagnosticCode.JUDGE_UNAVAILABLE;
            }, guidance, null, null);
        }

        public boolean correct() {
            return status == Status.CORRECT;
        }

        public boolean countsAsAttempt() {
            return status == Status.CORRECT || status == Status.INCORRECT;
        }
    }

    public Evaluation evaluate(Problem problem, String submitted) {
        if (submitted == null || submitted.isBlank()) {
            return new Evaluation(Status.EMPTY, false, DiagnosticCode.EMPTY_ANSWER,
                    "답안을 입력하면 문제의 목표 상태와 비교해 드릴게요.");
        }
        if (Set.of("declaration", "stylesheet").contains(problem.getMode())
                && submitted.length() > MAX_CSS_ANSWER_LENGTH) {
            return new Evaluation(Status.SYNTAX, false, DiagnosticCode.INPUT_TOO_LARGE,
                    "CSS 답안은 20,000자 이하로 작성해 주세요. "
                            + "반복된 규칙이나 문제 범위와 관계없는 코드를 줄이면 다시 채점할 수 있습니다.");
        }

        if ("selector".equals(problem.getMode())) {
            return evaluateSelector(problem, submitted);
        }
        if ("html".equals(problem.getMode())) {
            return evaluateHtml(problem, submitted);
        }
        if ("java".equals(problem.getMode()) || "algorithm".equals(problem.getMode())) {
            return evaluateCode(problem, submitted, javaCodeEvaluator, "Java");
        }
        if ("javascript".equals(problem.getMode())) {
            return evaluateCode(problem, submitted, javaScriptCodeEvaluator, "JavaScript");
        }
        if ("stylesheet".equals(problem.getMode())) {
            return evaluateStylesheet(problem, submitted);
        }
        return evaluateDeclarations(problem, submitted);
    }

    public boolean isCorrect(Problem problem, String submitted) {
        return evaluate(problem, submitted).correct();
    }

    private Evaluation evaluateHtml(Problem problem, String submitted) {
        HtmlIntentMatcher.Result result = htmlIntentMatcher.match(
                problem.getValidationJson(), problem.getAnswer(), submitted);
        if (!result.syntaxValid()) {
            return new Evaluation(Status.SYNTAX, false, DiagnosticCode.HTML_SYNTAX, result.guidance());
        }
        if (!result.safe()) {
            return new Evaluation(Status.SYNTAX, false, DiagnosticCode.HTML_UNSAFE_CONTENT, result.guidance());
        }
        if (result.intentMatched()) {
            return new Evaluation(Status.CORRECT, result.exactMatch(), DiagnosticCode.NONE, result.guidance());
        }
        return new Evaluation(Status.INCORRECT, false,
                DiagnosticCode.HTML_STRUCTURE_MISMATCH, result.guidance());
    }

    private Evaluation evaluateSelector(Problem problem, String submitted) {
        String expected = normalizeSelector(problem.getAnswer());
        String actual = normalizeSelector(submitted);
        boolean exact = expected.equals(actual);

        SelectorIntentMatcher.Result match = selectorIntentMatcher.match(problem.getHtml(), submitted);
        if (match.intentMatched()) {
            String guidance = exact
                    ? "목표 요소를 정확히 선택했습니다."
                    : "작성한 선택자도 목표 요소 " + match.targetCount()
                            + "개만 정확히 선택합니다. 같은 결과를 만드는 정답은 한 가지가 아닙니다.";
            return new Evaluation(Status.CORRECT, exact, guidance);
        }
        if (!match.syntaxValid() || !balanced(submitted)) {
            return new Evaluation(Status.SYNTAX, false,
                    "선택자의 괄호·대괄호·따옴표가 닫혔는지 확인해 보세요.");
        }
        if (isLikelyTypo(expected, actual)) {
            return new Evaluation(Status.TYPO, false,
                    "선택자 철자나 기호에 작은 오타가 있는 것 같아요. 입력한 표현을 한 글자씩 확인해 보세요.");
        }

        String guidance;
        if (match.selectedCount() == 0) {
                guidance = "현재 선택자와 일치하는 요소가 없습니다. 태그·class·속성 이름부터 확인해 보세요.";
        } else if (match.selectedCount() > match.targetCount()) {
                guidance = "목표가 아닌 요소까지 선택되었습니다. 부모 범위나 제외 조건을 더 구체적으로 지정해 보세요.";
        } else if (match.selectedCount() < match.targetCount()) {
                guidance = "선택해야 할 요소 일부가 빠졌습니다. 조건이 지나치게 좁지 않은지 확인해 보세요.";
        } else {
                guidance = "선택한 개수는 같지만 대상이 다릅니다. 관계 선택자와 요소 위치를 다시 확인해 보세요.";
        }
        return new Evaluation(Status.INCORRECT, false, guidance);
    }

    private Evaluation evaluateCode(
            Problem problem,
            String submitted,
            CodeExecutionEvaluator evaluator,
            String language
    ) {
        CodeExecutionEvaluator.Result result = evaluator.evaluate(problem, submitted);
        boolean javaScript = "JavaScript".equals(language);
        return switch (result.status()) {
            case PASSED -> {
                boolean exact = normalizeCode(problem.getAnswer()).equals(normalizeCode(submitted));
                yield new Evaluation(Status.CORRECT, exact, DiagnosticCode.NONE,
                        exact
                                ? javaScript
                                        ? "JavaScript 실행과 모든 테스트를 통과했습니다."
                                        : "Java 21 컴파일과 모든 테스트를 통과했습니다."
                                : javaScript
                                        ? "예시 코드와 구현 방식은 다르지만 JavaScript 실행과 모든 테스트를 통과했습니다."
                                        : "예시 코드와 구현 방식은 다르지만 Java 21 컴파일과 모든 테스트를 통과했습니다.",
                        null, result.testReport());
            }
            case COMPILE_ERROR -> new Evaluation(Status.SYNTAX, false, DiagnosticCode.COMPILE_ERROR,
                    (javaScript
                            ? "JavaScript 문법을 해석하지 못했습니다.\n"
                            : "Java 컴파일러가 코드를 해석하지 못했습니다.\n") + result.details(),
                    result.errorLine(), null);
            case FORBIDDEN_API -> new Evaluation(Status.SYNTAX, false, DiagnosticCode.FORBIDDEN_API,
                    result.details() + (javaScript
                            ? " 문제에서 요구한 함수와 JavaScript의 기본 내장 객체만 사용해 주세요."
                            : " 문제에서 요구한 메서드와 `java.util`의 기본 컬렉션만 사용해 주세요."));
            case SOURCE_CONTRACT_FAILED -> new Evaluation(Status.INCORRECT, false,
                    DiagnosticCode.SOURCE_CONTRACT, result.details());
            case TEST_FAILED -> new Evaluation(Status.INCORRECT, false, DiagnosticCode.TEST_FAILURE,
                    result.details() + "\n통과한 경우뿐 아니라 경계값과 빈 입력 조건도 다시 확인해 보세요.",
                    null, result.testReport());
            case RUNTIME_ERROR -> new Evaluation(Status.INCORRECT, false, DiagnosticCode.RUNTIME_ERROR,
                    "코드 실행 중 예외가 발생했습니다.\n" + result.details(),
                    null, result.testReport());
            case TIME_LIMIT -> new Evaluation(Status.INCORRECT, false, DiagnosticCode.TIME_LIMIT,
                    result.details() + " 반복문의 종료 조건과 알고리즘의 시간 복잡도를 확인해 보세요.");
            case INVALID_REQUEST, UNAVAILABLE -> new Evaluation(Status.ERROR, false,
                    DiagnosticCode.JUDGE_UNAVAILABLE,
                    "제출 내용은 시도 횟수에 반영하지 않았습니다. 잠시 후 다시 실행해 주세요.");
        };
    }

    private Evaluation evaluateDeclarations(Problem problem, String submitted) {
        Optional<String> delimiterIssue = delimiterIssue(submitted);
        if (delimiterIssue.isPresent()) {
            return new Evaluation(Status.SYNTAX, false, DiagnosticCode.UNBALANCED_DELIMITER,
                    delimiterIssue.get());
        }

        Map<String, String> expectedRaw = parseDeclarations(problem.getAnswer());
        Map<String, String> actualRaw = parseDeclarations(submitted);
        if (actualRaw.isEmpty()) {
            return new Evaluation(Status.SYNTAX, false, DiagnosticCode.MALFORMED_DECLARATION,
                    "CSS 선언을 찾지 못했습니다. `outline-offset: 3px;`처럼 `속성: 값;` 형태로 입력해 주세요.");
        }

        CssRenderingEvaluator.Result rendered = cssRenderingEvaluator.evaluate(problem, submitted);
        if (rendered.available()) {
            if (!rendered.syntaxValid()) {
                if (rendered.diagnosticCode() == CssRenderingEvaluator.DiagnosticCode.UNKNOWN_PROPERTY) {
                    Optional<String> typo = findPropertyTypo(
                            expectedRaw.keySet(), rendered.diagnosticProperty());
                    if (typo.isPresent()) {
                        return new Evaluation(Status.TYPO, false, DiagnosticCode.PROPERTY_NAME_TYPO,
                                typo.get());
                    }
                    return new Evaluation(Status.SYNTAX, false, DiagnosticCode.UNKNOWN_PROPERTY,
                            "브라우저가 `" + displayValue(rendered.diagnosticProperty())
                                    + "`을 CSS 속성명으로 인식하지 못했습니다. "
                                    + "`outline-offset: 3px;`처럼 속성명의 철자와 하이픈을 확인해 보세요.");
                }
                if (rendered.diagnosticCode() == CssRenderingEvaluator.DiagnosticCode.MISSING_UNIT) {
                    return new Evaluation(Status.SYNTAX, false, DiagnosticCode.MISSING_UNIT,
                            "숫자에 필요한 단위가 빠졌습니다. `margin-block: 7px;`처럼 "
                                    + "숫자 뒤에 이 속성이 허용하는 단위를 붙여 보세요.");
                }
                if (rendered.diagnosticCode() == CssRenderingEvaluator.DiagnosticCode.RENDER_LIMIT) {
                    return new Evaluation(Status.SYNTAX, false, DiagnosticCode.RENDER_LIMIT,
                            "렌더링 결과가 허용 크기를 넘었습니다. 지나치게 큰 width·height·여백 값을 줄여 주세요.");
                }
                if (rendered.diagnosticCode() == CssRenderingEvaluator.DiagnosticCode.INVALID_PROPERTY_VALUE) {
                    return new Evaluation(Status.SYNTAX, false, DiagnosticCode.INVALID_PROPERTY_VALUE,
                            "`" + displayValue(rendered.diagnosticProperty()) + "` 속성은 입력한 값 `"
                                    + displayValue(rendered.diagnosticValue())
                                    + "`을 지원하지 않습니다. `outline-offset: 3px;`처럼 해당 속성이 허용하는 값의 "
                                    + "철자·형식·함수 구성을 확인해 보세요.");
                }
                if (rendered.diagnosticCode() == CssRenderingEvaluator.DiagnosticCode.MALFORMED_DECLARATION) {
                    return new Evaluation(Status.SYNTAX, false, DiagnosticCode.MALFORMED_DECLARATION,
                            "선언의 속성과 값을 구분하는 `:`이 없거나 값이 비어 있습니다. "
                                    + "`outline-offset: 3px;`처럼 `속성: 값;` 형태로 입력해 주세요.");
                }
                return new Evaluation(Status.SYNTAX, false, DiagnosticCode.MALFORMED_DECLARATION,
                        "브라우저가 적용할 수 없는 CSS 선언이 있습니다. "
                                + "`outline-offset: 3px;`처럼 속성명, 값, `:`과 `;`을 확인해 보세요.");
            }
            if (rendered.matched()) {
                boolean exact = normalizeDeclarationText(problem.getAnswer())
                        .equals(normalizeDeclarationText(submitted));
                String guidance = switch (rendered.matchType()) {
                    case VISUAL -> "사용한 속성은 다르지만 실제 브라우저의 화면과 배치 결과가 같아 정답으로 인정했습니다.";
                    case COMPUTED -> exact
                            ? "브라우저 계산 스타일과 화면 결과가 목표 상태와 정확히 일치합니다."
                            : "표기 방식은 다르지만 브라우저 계산 스타일과 화면 결과가 같아 정답으로 인정했습니다.";
                    case NONE -> "브라우저에서 요구된 CSS 상태를 구현했습니다.";
                };
                return new Evaluation(Status.CORRECT, exact, DiagnosticCode.NONE, guidance);
            }

            if (rendered.diagnosticCode() == CssRenderingEvaluator.DiagnosticCode.MISSING_REQUIRED_PROPERTY) {
                return new Evaluation(Status.INCORRECT, false, DiagnosticCode.MISSING_REQUIRED_PROPERTY,
                        "CSS 문법은 맞지만 요구된 상태를 만드는 선언이 하나 이상 빠졌습니다. "
                                + "`outline: 1px solid currentColor; outline-offset: 3px;`처럼 "
                                + "문제의 조건을 선언 단위로 나눠 빠진 조건을 찾아보세요.");
            }
            if (rendered.diagnosticCode() == CssRenderingEvaluator.DiagnosticCode.VALUE_MISMATCH) {
                return new Evaluation(Status.INCORRECT, false, DiagnosticCode.VALUE_MISMATCH,
                        "`" + displayValue(rendered.differingProperty())
                                + "` 값은 유효한 CSS지만 브라우저 계산 결과가 목표와 다릅니다. "
                                + "문제에 제시된 크기·간격·정렬 조건을 다시 대조해 보세요.");
            }
            String guidance = "브라우저 계산 스타일은 일부 맞지만 렌더링한 화면 또는 요소 배치가 목표와 다릅니다. "
                    + "미리보기의 크기·간격·정렬과 불필요한 선언을 확인해 보세요.";
            return new Evaluation(Status.INCORRECT, false, DiagnosticCode.RESULT_MISMATCH, guidance);
        }

        return new Evaluation(Status.ERROR, false, DiagnosticCode.JUDGE_UNAVAILABLE,
                "CSS 브라우저 채점 서비스를 사용할 수 없어 결과를 확정하지 않았습니다. "
                        + "제출 내용은 시도 횟수에 반영하지 않았습니다. 잠시 후 다시 실행해 주세요.");
    }

    private Evaluation evaluateStylesheet(Problem problem, String submitted) {
        Optional<String> delimiterIssue = delimiterIssue(submitted);
        if (delimiterIssue.isPresent()) {
            return new Evaluation(Status.SYNTAX, false, DiagnosticCode.UNBALANCED_DELIMITER,
                    delimiterIssue.get());
        }

        CssRenderingEvaluator.Result rendered = cssRenderingEvaluator.evaluate(problem, submitted);
        if (!rendered.available()) {
            return new Evaluation(Status.ERROR, false, DiagnosticCode.JUDGE_UNAVAILABLE,
                    "CSS 브라우저 채점 서비스를 사용할 수 없어 결과를 확정하지 않았습니다. "
                            + "제출 내용은 시도 횟수에 반영하지 않았습니다. 잠시 후 다시 실행해 주세요.");
        }
        if (!rendered.syntaxValid()) {
            if (rendered.diagnosticCode() == CssRenderingEvaluator.DiagnosticCode.FORBIDDEN_RESOURCE) {
                return new Evaluation(Status.SYNTAX, false, DiagnosticCode.FORBIDDEN_RESOURCE,
                        "외부 URL, @import, 외부 웹 글꼴과 외부 이미지는 사용할 수 없습니다. "
                                + "문제에서 제공한 HTML과 data: 형식의 로컬 자료만 사용해 주세요.");
            }
            if (rendered.diagnosticCode() == CssRenderingEvaluator.DiagnosticCode.RENDER_LIMIT) {
                return new Evaluation(Status.SYNTAX, false, DiagnosticCode.RENDER_LIMIT,
                        "렌더링 결과가 허용 크기를 넘었습니다. 지나치게 큰 width·height·여백 값을 줄여 주세요.");
            }
            if (rendered.diagnosticCode() == CssRenderingEvaluator.DiagnosticCode.UNKNOWN_PROPERTY) {
                Optional<String> typo = findPropertyTypo(
                        parseDeclarations(problem.getAnswer()).keySet(),
                        rendered.diagnosticProperty());
                if (typo.isPresent()) {
                    return new Evaluation(Status.TYPO, false, DiagnosticCode.PROPERTY_NAME_TYPO,
                            typo.get());
                }
                return new Evaluation(Status.SYNTAX, false, DiagnosticCode.UNKNOWN_PROPERTY,
                        "브라우저가 `" + displayValue(rendered.diagnosticProperty())
                                + "`을 CSS 속성명으로 인식하지 못했습니다. "
                                + "전체 규칙 안의 속성명 철자와 하이픈을 확인해 보세요.");
            }
            if (rendered.diagnosticCode() == CssRenderingEvaluator.DiagnosticCode.MISSING_UNIT) {
                return new Evaluation(Status.SYNTAX, false, DiagnosticCode.MISSING_UNIT,
                        "숫자에 필요한 단위가 빠졌습니다. `" + displayValue(rendered.diagnosticProperty())
                                + ": " + displayValue(rendered.suggestedValue())
                                + ";`처럼 숫자 뒤에 속성이 허용하는 단위를 붙여 보세요.");
            }
            if (rendered.diagnosticCode() == CssRenderingEvaluator.DiagnosticCode.INVALID_PROPERTY_VALUE) {
                return new Evaluation(Status.SYNTAX, false, DiagnosticCode.INVALID_PROPERTY_VALUE,
                        "`" + displayValue(rendered.diagnosticProperty()) + "` 속성은 입력한 값 `"
                                + displayValue(rendered.diagnosticValue())
                                + "`을 지원하지 않습니다. 값의 철자·단위·함수 구성을 확인해 보세요.");
            }
            return new Evaluation(Status.SYNTAX, false, DiagnosticCode.MALFORMED_DECLARATION,
                    "브라우저가 전체 CSS 규칙을 적용하지 못했습니다. "
                            + "선택자 뒤의 중괄호와 각 `속성: 값;` 선언을 확인해 보세요.");
        }
        if (rendered.matched()) {
            boolean exact = problem.getAnswer().trim().equals(submitted.trim());
            return new Evaluation(Status.CORRECT, exact, DiagnosticCode.NONE,
                    exact
                            ? "모든 화면 크기와 상태에서 목표 화면과 배치가 정확히 일치합니다."
                            : "작성 방식은 다르지만 모든 화면 크기와 상태에서 목표 화면과 배치가 같아 "
                                    + "정답으로 인정했습니다.");
        }
        return new Evaluation(Status.INCORRECT, false, DiagnosticCode.RESULT_MISMATCH,
                "CSS 문법은 맞지만 화면 크기 또는 상호작용 상태 중 하나의 화면·배치가 목표와 다릅니다. "
                        + "기본 화면, 반응형 배치와 hover·focus 상태를 차례로 확인해 보세요.");
    }

    private Optional<String> findPropertyTypo(Collection<String> expectedProperties, String actualProperty) {
        if (actualProperty == null || actualProperty.isBlank()) return Optional.empty();
        String closest = expectedProperties.stream()
                .min(Comparator.comparingInt(property -> levenshtein(property, actualProperty)))
                .orElse("");
        int distance = levenshtein(closest, actualProperty);
        if (closest.isEmpty() || distance == 0 || distance > typoThreshold(closest)) {
            return Optional.empty();
        }
        return Optional.of("브라우저가 `" + actualProperty
                + "`을 속성명으로 인식하지 못했고, 필요한 속성과 철자가 매우 비슷합니다. "
                + "`outline-offset: 3px;`처럼 속성명 철자와 하이픈을 한 글자씩 확인해 보세요.");
    }

    private Map<String, String> canonicalDeclarations(Map<String, String> declarations) {
        Map<String, String> result = new LinkedHashMap<>();
        declarations.forEach((property, value) -> applyDeclaration(result, property, value));
        normalizeCenteredLayout(result);
        return result;
    }

    private void applyDeclaration(Map<String, String> result, String rawProperty, String rawValue) {
        String property = canonicalProperty(rawProperty);
        List<String> values = splitTopLevelWhitespace(rawValue.trim());

        switch (property) {
            case "margin", "padding" -> expandBox(result, property, values);
            case "inset" -> expandSides(result, "", values, "top", "right", "bottom", "left");
            case "margin-inline", "padding-inline" ->
                    expandAxis(result, property.substring(0, property.indexOf('-')), values, "left", "right");
            case "margin-block", "padding-block" ->
                    expandAxis(result, property.substring(0, property.indexOf('-')), values, "top", "bottom");
            case "inset-inline" -> expandAxis(result, "", values, "left", "right");
            case "inset-block" -> expandAxis(result, "", values, "top", "bottom");
            case "gap" -> {
                String row = values.isEmpty() ? "" : values.get(0);
                String column = values.size() > 1 ? values.get(1) : row;
                put(result, "row-gap", row);
                put(result, "column-gap", column);
            }
            case "overflow" -> {
                String x = values.isEmpty() ? "" : values.get(0);
                String y = values.size() > 1 ? values.get(1) : x;
                put(result, "overflow-x", x);
                put(result, "overflow-y", y);
            }
            case "place-items" -> expandPair(result, values, "align-items", "justify-items");
            case "place-content" -> expandPair(result, values, "align-content", "justify-content");
            case "place-self" -> expandPair(result, values, "align-self", "justify-self");
            case "flex-flow" -> {
                for (String value : values) {
                    if (Set.of("row", "row-reverse", "column", "column-reverse").contains(value)) {
                        put(result, "flex-direction", value);
                    } else {
                        put(result, "flex-wrap", value);
                    }
                }
            }
            case "flex" -> expandFlex(result, values);
            default -> put(result, property, rawValue);
        }
    }

    private void normalizeCenteredLayout(Map<String, String> result) {
        String display = result.get("display");
        boolean flexCentered = ("flex".equals(display) || "inline-flex".equals(display))
                && "center".equals(result.get("justify-content"))
                && "center".equals(result.get("align-items"));
        boolean gridCentered = ("grid".equals(display) || "inline-grid".equals(display))
                && "center".equals(result.get("justify-items"))
                && "center".equals(result.get("align-items"));
        if (!flexCentered && !gridCentered) return;

        result.put("__two-axis-centered", "true");
        result.remove("display");
        result.remove("align-items");
        if (flexCentered) result.remove("justify-content");
        if (gridCentered) result.remove("justify-items");
    }

    private void expandBox(Map<String, String> result, String prefix, List<String> values) {
        expandSides(result, prefix + "-", values, "top", "right", "bottom", "left");
    }

    private void expandSides(Map<String, String> result, String prefix, List<String> values,
                             String top, String right, String bottom, String left) {
        if (values.isEmpty() || values.size() > 4) {
            put(result, prefix.endsWith("-") ? prefix.substring(0, prefix.length() - 1) : prefix, String.join(" ", values));
            return;
        }
        String first = values.get(0);
        String second = values.size() > 1 ? values.get(1) : first;
        String third = values.size() > 2 ? values.get(2) : first;
        String fourth = values.size() > 3 ? values.get(3) : second;
        put(result, prefix + top, first);
        put(result, prefix + right, second);
        put(result, prefix + bottom, third);
        put(result, prefix + left, fourth);
    }

    private void expandAxis(Map<String, String> result, String prefix, List<String> values,
                            String start, String end) {
        if (values.isEmpty()) return;
        String first = values.get(0);
        String second = values.size() > 1 ? values.get(1) : first;
        String propertyPrefix = prefix.isEmpty() ? "" : prefix + "-";
        put(result, propertyPrefix + start, first);
        put(result, propertyPrefix + end, second);
    }

    private void expandPair(Map<String, String> result, List<String> values, String firstProperty,
                            String secondProperty) {
        if (values.isEmpty()) return;
        put(result, firstProperty, values.get(0));
        put(result, secondProperty, values.size() > 1 ? values.get(1) : values.get(0));
    }

    private void expandFlex(Map<String, String> result, List<String> values) {
        if (values.size() == 1) {
            switch (values.get(0)) {
                case "auto" -> values = List.of("1", "1", "auto");
                case "none" -> values = List.of("0", "0", "auto");
                case "initial" -> values = List.of("0", "1", "auto");
                default -> values = List.of(values.get(0), "1", "0%");
            }
        } else if (values.size() == 2) {
            values = looksLikeSize(values.get(1))
                    ? List.of(values.get(0), "1", values.get(1))
                    : List.of(values.get(0), values.get(1), "0%");
        }
        if (values.size() >= 3) {
            put(result, "flex-grow", values.get(0));
            put(result, "flex-shrink", values.get(1));
            put(result, "flex-basis", values.get(2));
        }
    }

    private boolean looksLikeSize(String value) {
        return value.equals("auto") || value.equals("content") || value.equals("0")
                || value.matches("-?(?:\\d*\\.)?\\d+(?:px|rem|em|%|vw|vh|dvh|fr)");
    }

    private void put(Map<String, String> result, String property, String value) {
        result.put(canonicalProperty(property), normalizeValue(property, value));
    }

    private String canonicalProperty(String property) {
        return switch (property.toLowerCase(Locale.ROOT).trim()) {
            case "margin-inline-start" -> "margin-left";
            case "margin-inline-end" -> "margin-right";
            case "margin-block-start" -> "margin-top";
            case "margin-block-end" -> "margin-bottom";
            case "padding-inline-start" -> "padding-left";
            case "padding-inline-end" -> "padding-right";
            case "padding-block-start" -> "padding-top";
            case "padding-block-end" -> "padding-bottom";
            case "inset-inline-start" -> "left";
            case "inset-inline-end" -> "right";
            case "inset-block-start" -> "top";
            case "inset-block-end" -> "bottom";
            case "border-inline-start" -> "border-left";
            case "border-inline-end" -> "border-right";
            default -> property.toLowerCase(Locale.ROOT).trim();
        };
    }

    private String normalizeSelector(String value) {
        if (value == null) return "";
        return value.trim()
                .replaceAll("\\s*([>+~,])\\s*", "$1")
                .replaceAll("\\s+", " ");
    }

    private String normalizeCode(String value) {
        if (value == null) return "";
        return value.replaceAll("(?s)/\\*.*?\\*/", "")
                .replaceAll("(?m)//.*$", "")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private String normalizeDeclarationText(String value) {
        Map<String, String> declarations = canonicalDeclarations(parseDeclarations(value));
        return declarations.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> entry.getKey() + ":" + entry.getValue())
                .reduce((left, right) -> left + ";" + right)
                .orElse("");
    }

    private String normalizeValue(String property, String value) {
        if (value == null) return null;
        String normalized = value.trim().toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", " ")
                .replaceAll("\\s*,\\s*", ",")
                .replaceAll("\\(\\s*", "(")
                .replaceAll("\\s*\\)", ")")
                .replaceAll("\\s*/\\s*", "/");
        normalized = LEADING_DECIMAL.matcher(normalized).replaceAll("$10.$2");
        normalized = ZERO_WITH_UNIT.matcher(normalized).replaceAll("0");

        if (property.contains("color") || normalized.startsWith("#")
                || normalized.startsWith("rgb(") || normalized.startsWith("rgba(")) {
            String color = normalizeColor(normalized);
            if (color != null) normalized = color;
        }
        if ("transition".equals(property)) {
            normalized = Arrays.stream(normalized.split(","))
                    .map(String::trim)
                    .sorted()
                    .reduce((left, right) -> left + "," + right)
                    .orElse("");
        }
        if ("grid-template-columns".equals(property) || "grid-template-rows".equals(property)) {
            normalized = expandSimpleRepeat(normalized);
        }
        return normalized;
    }

    private String expandSimpleRepeat(String value) {
        Matcher matcher = Pattern.compile("^repeat\\((\\d+),([^()]+)\\)$").matcher(value);
        if (!matcher.matches()) return value;
        int count = Integer.parseInt(matcher.group(1));
        if (count < 1 || count > 24) return value;
        return String.join(" ", Collections.nCopies(count, matcher.group(2).trim()));
    }

    private String normalizeColor(String value) {
        Map<String, String> named = Map.of(
                "transparent", "rgba(0,0,0,0)",
                "black", "rgba(0,0,0,1)",
                "white", "rgba(255,255,255,1)",
                "red", "rgba(255,0,0,1)",
                "blue", "rgba(0,0,255,1)",
                "green", "rgba(0,128,0,1)"
        );
        if (named.containsKey(value)) return named.get(value);

        if (value.matches("#[0-9a-f]{3,8}")) {
            String hex = value.substring(1);
            if (hex.length() == 3 || hex.length() == 4) {
                StringBuilder expanded = new StringBuilder();
                for (char character : hex.toCharArray()) expanded.append(character).append(character);
                hex = expanded.toString();
            }
            if (hex.length() == 6 || hex.length() == 8) {
                int red = Integer.parseInt(hex.substring(0, 2), 16);
                int green = Integer.parseInt(hex.substring(2, 4), 16);
                int blue = Integer.parseInt(hex.substring(4, 6), 16);
                double alpha = hex.length() == 8 ? Integer.parseInt(hex.substring(6, 8), 16) / 255.0 : 1;
                return "rgba(" + red + "," + green + "," + blue + "," + formatNumber(alpha) + ")";
            }
        }

        Matcher rgb = Pattern.compile("rgba?\\((.*)\\)").matcher(value);
        if (!rgb.matches()) return null;
        String[] parts = rgb.group(1).trim().replace("/", " ").split("[,\\s]+");
        if (parts.length < 3 || parts.length > 4) return null;
        try {
            int red = parseColorChannel(parts[0]);
            int green = parseColorChannel(parts[1]);
            int blue = parseColorChannel(parts[2]);
            double alpha = parts.length == 4 ? parseAlpha(parts[3]) : 1;
            return "rgba(" + red + "," + green + "," + blue + "," + formatNumber(alpha) + ")";
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private int parseColorChannel(String value) {
        if (value.endsWith("%")) {
            return (int) Math.round(Double.parseDouble(value.substring(0, value.length() - 1)) * 2.55);
        }
        return Integer.parseInt(value);
    }

    private double parseAlpha(String value) {
        return value.endsWith("%")
                ? Double.parseDouble(value.substring(0, value.length() - 1)) / 100
                : Double.parseDouble(value);
    }

    private String formatNumber(double value) {
        if (Math.abs(value - Math.rint(value)) < 0.000001) return Long.toString(Math.round(value));
        return String.format(Locale.ROOT, "%.4f", value).replaceAll("0+$", "").replaceAll("\\.$", "");
    }

    private Map<String, String> parseDeclarations(String css) {
        Map<String, String> result = new LinkedHashMap<>();
        if (css == null) return result;
        Matcher matcher = DECLARATION.matcher(css);
        while (matcher.find()) {
            result.put(matcher.group(1).toLowerCase(Locale.ROOT), matcher.group(2).trim());
        }
        return result;
    }

    private List<String> splitTopLevelWhitespace(String value) {
        List<String> parts = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int depth = 0;
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (character == '(' || character == '[') depth++;
            if (character == ')' || character == ']') depth--;
            if (Character.isWhitespace(character) && depth == 0) {
                if (!current.isEmpty()) {
                    parts.add(current.toString());
                    current.setLength(0);
                }
            } else {
                current.append(character);
            }
        }
        if (!current.isEmpty()) parts.add(current.toString());
        return parts;
    }

    private boolean balanced(String value) {
        return delimiterIssue(value).isEmpty();
    }

    private Optional<String> delimiterIssue(String value) {
        Deque<Character> stack = new ArrayDeque<>();
        char quote = 0;
        boolean escaped = false;
        boolean comment = false;
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            char next = index + 1 < value.length() ? value.charAt(index + 1) : 0;
            if (comment) {
                if (character == '*' && next == '/') {
                    comment = false;
                    index++;
                }
                continue;
            }
            if (escaped) {
                escaped = false;
                continue;
            }
            if (character == '\\') {
                escaped = true;
                continue;
            }
            if (quote != 0) {
                if (character == quote) quote = 0;
                continue;
            }
            if (character == '/' && next == '*') {
                comment = true;
                index++;
            } else if (character == '\'' || character == '"') {
                quote = character;
            } else if (character == '(' || character == '[' || character == '{') {
                stack.push(character);
            } else if (character == ')' || character == ']' || character == '}') {
                if (stack.isEmpty()) {
            return Optional.of("여는 기호 없이 닫는 `" + character
                            + "`가 입력되었습니다. `width: calc(50% - 3px);`처럼 기호의 짝을 확인해 보세요.");
                }
                char open = stack.pop();
                if ((open == '(' && character != ')') || (open == '[' && character != ']')
                        || (open == '{' && character != '}')) {
                    return Optional.of("여는 `" + open + "`와 닫는 `" + character
                            + "`의 종류가 다릅니다. 괄호·대괄호·중괄호를 같은 종류끼리 닫아 주세요.");
                }
            }
        }
        if (comment) {
            return Optional.of("CSS 주석이 닫히지 않았습니다. `/* 설명 */`처럼 `*/`로 주석을 닫아 주세요.");
        }
        if (quote != 0) {
            return Optional.of("따옴표가 닫히지 않았습니다. `content: \"예시\";`처럼 같은 따옴표로 값을 닫아 주세요.");
        }
        if (!stack.isEmpty()) {
            char open = stack.peek();
            char close = switch (open) {
                case '(' -> ')';
                case '[' -> ']';
                default -> '}';
            };
            return Optional.of("여는 `" + open + "`에 대응하는 닫는 `" + close
                    + "`가 없습니다. `width: calc(50% - 3px);`처럼 기호의 짝을 맞춰 주세요.");
        }
        return Optional.empty();
    }

    private String displayValue(String value) {
        return value == null || value.isBlank() ? "입력한 표현" : value;
    }

    private boolean isLikelyTypo(String expected, String actual) {
        int distance = levenshtein(expected, actual);
        return distance > 0 && distance <= typoThreshold(expected);
    }

    private int typoThreshold(String value) {
        if (value.length() < 5) return 1;
        if (value.length() < 14) return 2;
        return 3;
    }

    private int levenshtein(String left, String right) {
        int[] previous = new int[right.length() + 1];
        for (int index = 0; index <= right.length(); index++) previous[index] = index;
        for (int leftIndex = 1; leftIndex <= left.length(); leftIndex++) {
            int[] current = new int[right.length() + 1];
            current[0] = leftIndex;
            for (int rightIndex = 1; rightIndex <= right.length(); rightIndex++) {
                int substitution = previous[rightIndex - 1]
                        + (left.charAt(leftIndex - 1) == right.charAt(rightIndex - 1) ? 0 : 1);
                current[rightIndex] = Math.min(
                        Math.min(current[rightIndex - 1] + 1, previous[rightIndex] + 1),
                        substitution
                );
            }
            previous = current;
        }
        return previous[right.length()];
    }
}
