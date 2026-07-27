package com.codequest.platform.service;

import com.codequest.platform.model.Problem;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class AnswerValidatorTest {
    private static final JavaCodeEvaluator JAVA_UNAVAILABLE =
            (problem, submittedCode) -> JavaCodeEvaluator.Result.unavailable();
    private static final JavaScriptCodeEvaluator JAVASCRIPT_UNAVAILABLE =
            (problem, submittedCode) -> CodeExecutionEvaluator.Result.unavailable("JavaScript");
    private final AnswerValidator validator = new AnswerValidator(
            (problem, submittedCss) -> CssRenderingEvaluator.Result.unavailable(),
            JAVA_UNAVAILABLE,
            JAVASCRIPT_UNAVAILABLE
    );

    @Test void acceptsEquivalentSelectorSpacing() {
        Problem p = problem("selector", ".menu > li");
        p.setHtml("<ul class=\"menu\"><li data-target>메뉴</li></ul>");
        assertThat(validator.isCorrect(p, " .menu>li ")).isTrue();
    }

    @Test void doesNotGradeExactDeclarationWhenBrowserIsUnavailable() {
        Problem p = problem("declaration", "display: flex; gap: 12px;");

        AnswerValidator.Evaluation result = validator.evaluate(p, "display: flex; gap: 12px;");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.ERROR);
        assertThat(result.diagnosticCode()).isEqualTo(AnswerValidator.DiagnosticCode.JUDGE_UNAVAILABLE);
        assertThat(result.correct()).isFalse();
        assertThat(result.countsAsAttempt()).isFalse();
        assertThat(result.guidance()).contains("결과를 확정하지 않았습니다")
                .contains("시도 횟수에 반영하지 않았습니다");
    }

    @Test void doesNotGradeParseableWrongDeclarationWhenBrowserIsUnavailable() {
        Problem p = problem("declaration", "display: grid; gap: 12px;");

        AnswerValidator.Evaluation result = validator.evaluate(p, "display:flex; gap:12px");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.ERROR);
        assertThat(result.diagnosticCode()).isEqualTo(AnswerValidator.DiagnosticCode.JUDGE_UNAVAILABLE);
        assertThat(result.countsAsAttempt()).isFalse();
    }

    @Test void acceptsAdvancedFunctionsAndCustomPropertiesWhenBrowserConfirmsTheResult() {
        AnswerValidator browserValidator = matchingBrowserValidator(CssRenderingEvaluator.MatchType.COMPUTED);
        Problem p = problem("declaration",
                "--space: 20px; width: min(640px, calc(100% - 32px)); padding: var(--space);");
        assertThat(browserValidator.isCorrect(p,
                "padding:var(--space); --space:20px; width:min(640px,calc(100% - 32px));")).isTrue();
    }

    @Test void acceptsAdvancedSelectorSpacing() {
        Problem p = problem("selector", ".dashboard > :not(header, footer):has(> [data-widget])");
        p.setHtml("""
                <div class="dashboard">
                  <main data-target><section data-widget>위젯</section></main>
                  <header><section data-widget>헤더 위젯</section></header>
                </div>
                """);
        assertThat(validator.isCorrect(p,
                ".dashboard>:not(header,footer):has(>[data-widget])")).isTrue();
    }

    @Test void acceptsDifferentSelectorWhenBrowserTargetSetMatches() {
        Problem p = problem("selector", ".note");
        p.setHtml("<div><p class=\"note\" data-target>A</p><span class=\"note\" data-target>B</span></div>");
        AnswerValidator.Evaluation result = validator.evaluate(p, "[class~=\"note\"]");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.CORRECT);
        assertThat(result.exactMatch()).isFalse();
    }

    @Test void rejectsCaseChangedClassNamesEvenWhenTheyResembleTheCanonicalAnswer() {
        Problem login = problem("selector", ".login input[required]");
        login.setHtml("""
                <form class="login">
                  <input required data-target>
                  <input>
                </form>
                """);
        Problem board = problem("selector", ".post:not(.notice) > a");
        board.setHtml("""
                <article class="post notice"><a>공지</a></article>
                <article class="post"><a data-target>일반글</a></article>
                """);

        AnswerValidator.Evaluation loginResult =
                validator.evaluate(login, ".LOGIN input[required]");
        AnswerValidator.Evaluation boardResult =
                validator.evaluate(board, ".POST:not(.NOTICE) > A");

        assertThat(loginResult.status()).isEqualTo(AnswerValidator.Status.INCORRECT);
        assertThat(loginResult.guidance()).contains("일치하는 요소가 없습니다");
        assertThat(boardResult.status()).isEqualTo(AnswerValidator.Status.INCORRECT);
        assertThat(boardResult.guidance()).contains("일치하는 요소가 없습니다");
    }

    @Test void alwaysChecksTheSelectedElementsBeforeAcceptingNormalizedSelectorText() {
        Problem p = problem("selector", "[data-label=\"입금, 출금\"]");
        p.setHtml("<button data-label=\"입금, 출금\" data-target>거래</button>");

        AnswerValidator.Evaluation result =
                validator.evaluate(p, "[data-label=\"입금,출금\"]");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.INCORRECT);
        assertThat(result.guidance()).contains("일치하는 요소가 없습니다");
    }

    @Test void acceptsEquivalentShorthandAndLogicalDeclarationsWhenBrowserConfirmsTheResult() {
        AnswerValidator browserValidator = matchingBrowserValidator(CssRenderingEvaluator.MatchType.COMPUTED);
        Problem p = problem("declaration", "padding-inline: 24px; padding-block: 16px;");

        assertThat(browserValidator.isCorrect(p, "padding: 16px 24px;")).isTrue();
    }

    @Test void acceptsEquivalentInsetLonghandsWhenBrowserConfirmsTheResult() {
        AnswerValidator browserValidator = matchingBrowserValidator(CssRenderingEvaluator.MatchType.COMPUTED);
        Problem p = problem("declaration", "position: fixed; inset: 0;");

        assertThat(browserValidator.isCorrect(p,
                "top:0px; right:0; bottom:0rem; left:0%; position:fixed;")).isTrue();
    }

    @Test void acceptsFlexAndGridTwoAxisCenteringWhenBrowserConfirmsVisualMatch() {
        AnswerValidator browserValidator = matchingBrowserValidator(CssRenderingEvaluator.MatchType.VISUAL);
        Problem p = problem("declaration",
                "position: fixed; inset: 0; display: grid; place-items: center;");

        assertThat(browserValidator.isCorrect(p,
                "position:fixed; top:0; right:0; bottom:0; left:0; "
                        + "display:flex; justify-content:center; align-items:center;")).isTrue();
    }

    @Test void classifiesBlankWithoutCountingItAsAnAttempt() {
        Problem p = problem("declaration", "display: flex;");
        AnswerValidator.Evaluation result = validator.evaluate(p, "  ");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.EMPTY);
        assertThat(result.countsAsAttempt()).isFalse();
    }

    @Test void classifiesParserRejectedValueWithoutCountingItAsAnAttempt() {
        AnswerValidator browserValidator = validatorWithDiagnostic(
                false, CssRenderingEvaluator.DiagnosticCode.INVALID_PROPERTY_VALUE,
                "display", "fles", null);
        Problem p = problem("declaration", "display: flex; gap: 12px;");
        AnswerValidator.Evaluation result = browserValidator.evaluate(
                p, "display: fles; gap: 12px;");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.SYNTAX);
        assertThat(result.diagnosticCode()).isEqualTo(AnswerValidator.DiagnosticCode.INVALID_PROPERTY_VALUE);
        assertThat(result.countsAsAttempt()).isFalse();
    }

    @Test void classifiesLikelyPropertyTypoWithoutCountingItAsAnAttempt() {
        AnswerValidator browserValidator = validatorWithDiagnostic(
                false, CssRenderingEvaluator.DiagnosticCode.UNKNOWN_PROPERTY,
                "displai", "flex", null);
        Problem p = problem("declaration", "display: flex;");
        AnswerValidator.Evaluation result = browserValidator.evaluate(
                p, "displai: flex;");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.TYPO);
        assertThat(result.diagnosticCode()).isEqualTo(AnswerValidator.DiagnosticCode.PROPERTY_NAME_TYPO);
        assertThat(result.countsAsAttempt()).isFalse();
    }

    @Test void doesNotCallAnUnrelatedUnknownPropertyATypo() {
        AnswerValidator browserValidator = validatorWithDiagnostic(
                false, CssRenderingEvaluator.DiagnosticCode.UNKNOWN_PROPERTY,
                "banana", "flex", null);
        Problem p = problem("declaration", "display: flex;");

        AnswerValidator.Evaluation result = browserValidator.evaluate(p, "banana: flex;");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.SYNTAX);
        assertThat(result.diagnosticCode()).isEqualTo(AnswerValidator.DiagnosticCode.UNKNOWN_PROPERTY);
        assertThat(result.countsAsAttempt()).isFalse();
    }

    @Test void classifiesMissingUnitWithoutCountingItAsAnAttempt() {
        AnswerValidator browserValidator = validatorWithDiagnostic(
                false, CssRenderingEvaluator.DiagnosticCode.MISSING_UNIT,
                "width", "100", "100px");
        Problem p = problem("declaration", "width: 100px;");

        AnswerValidator.Evaluation result = browserValidator.evaluate(p, "width: 100;");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.SYNTAX);
        assertThat(result.diagnosticCode()).isEqualTo(AnswerValidator.DiagnosticCode.MISSING_UNIT);
        assertThat(result.guidance()).contains("`margin-block: 7px;`");
        assertThat(result.guidance()).doesNotContain("`width: 100px;`");
        assertThat(result.countsAsAttempt()).isFalse();
    }

    @Test void treatsNumericDifferenceAsIncorrectInsteadOfTypo() {
        AnswerValidator browserValidator = new AnswerValidator((problem, submittedCss) ->
                new CssRenderingEvaluator.Result(true, true, false,
                        CssRenderingEvaluator.MatchType.NONE, "gap",
                        CssRenderingEvaluator.DiagnosticCode.VALUE_MISMATCH,
                        "gap", null, null), JAVA_UNAVAILABLE, JAVASCRIPT_UNAVAILABLE);
        Problem p = problem("declaration", "display: grid; gap: 12px;");
        AnswerValidator.Evaluation result = browserValidator.evaluate(
                p, "display: grid; gap: 16px;");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.INCORRECT);
        assertThat(result.countsAsAttempt()).isTrue();
    }

    @Test void classifiesMalformedDeclarationAsSyntaxHelp() {
        Problem p = problem("declaration", "display: flex;");
        AnswerValidator.Evaluation result = validator.evaluate(
                p, "display flex");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.SYNTAX);
        assertThat(result.countsAsAttempt()).isFalse();
    }

    @Test void classifiesUnclosedParenthesisPrecisely() {
        Problem p = problem("declaration", "width: calc(100% - 24px);");
        AnswerValidator.Evaluation result = validator.evaluate(
                p, "width: calc(100% - 24px;");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.SYNTAX);
        assertThat(result.diagnosticCode()).isEqualTo(AnswerValidator.DiagnosticCode.UNBALANCED_DELIMITER);
        assertThat(result.guidance()).contains("닫는 `)`");
        assertThat(result.countsAsAttempt()).isFalse();
    }

    @Test void acceptsBrowserComputedStyleMatchEvenWhenDeclarationTextDiffers() {
        AnswerValidator browserValidator = new AnswerValidator((problem, submittedCss) ->
                new CssRenderingEvaluator.Result(true, true, true,
                        CssRenderingEvaluator.MatchType.COMPUTED, null),
                JAVA_UNAVAILABLE, JAVASCRIPT_UNAVAILABLE);
        Problem p = problem("declaration", "width: calc(100% - 32px);");

        AnswerValidator.Evaluation result = browserValidator.evaluate(
                p, "width: calc(100% - 2rem);");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.CORRECT);
        assertThat(result.exactMatch()).isFalse();
        assertThat(result.guidance()).contains("브라우저 계산 스타일");
        assertThat(result.countsAsAttempt()).isTrue();
    }

    @Test void rejectsDeclarationWhenBrowserRenderingDiffers() {
        AnswerValidator browserValidator = new AnswerValidator((problem, submittedCss) ->
                new CssRenderingEvaluator.Result(true, true, false,
                        CssRenderingEvaluator.MatchType.NONE, null),
                JAVA_UNAVAILABLE, JAVASCRIPT_UNAVAILABLE);
        Problem p = problem("declaration", "display: flex;");

        AnswerValidator.Evaluation result = browserValidator.evaluate(
                p, "display: flex; color: red;");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.INCORRECT);
        assertThat(result.guidance()).contains("렌더링한 화면");
    }

    @Test void reportsPropertyWhoseBrowserComputedValueDiffers() {
        AnswerValidator browserValidator = new AnswerValidator((problem, submittedCss) ->
                new CssRenderingEvaluator.Result(true, true, false,
                        CssRenderingEvaluator.MatchType.NONE, "gap",
                        CssRenderingEvaluator.DiagnosticCode.VALUE_MISMATCH,
                        "gap", null, null), JAVA_UNAVAILABLE, JAVASCRIPT_UNAVAILABLE);
        Problem p = problem("declaration", "display: grid; gap: 12px;");

        AnswerValidator.Evaluation result = browserValidator.evaluate(
                p, "display: grid; gap: 16px;");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.INCORRECT);
        assertThat(result.diagnosticCode()).isEqualTo(AnswerValidator.DiagnosticCode.VALUE_MISMATCH);
        assertThat(result.guidance()).contains("`gap`");
    }

    @Test void missingRequiredPropertyCountsAsConceptualAttempt() {
        AnswerValidator browserValidator = new AnswerValidator((problem, submittedCss) ->
                new CssRenderingEvaluator.Result(true, true, false,
                        CssRenderingEvaluator.MatchType.NONE, "gap",
                        CssRenderingEvaluator.DiagnosticCode.MISSING_REQUIRED_PROPERTY,
                        "gap", null, null), JAVA_UNAVAILABLE, JAVASCRIPT_UNAVAILABLE);
        Problem p = problem("declaration", "display: flex; gap: 12px;");

        AnswerValidator.Evaluation result = browserValidator.evaluate(p, "display: flex;");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.INCORRECT);
        assertThat(result.diagnosticCode()).isEqualTo(AnswerValidator.DiagnosticCode.MISSING_REQUIRED_PROPERTY);
        assertThat(result.countsAsAttempt()).isTrue();
        assertThat(result.guidance()).doesNotContain("`gap`");
    }

    @Test void acceptsDifferentJavaImplementationWhenAllTestsPass() {
        AnswerValidator javaValidator = new AnswerValidator(
                (problem, css) -> CssRenderingEvaluator.Result.unavailable(),
                (problem, code) -> new JavaCodeEvaluator.Result(
                        JavaCodeEvaluator.Status.PASSED, "모든 테스트를 통과했습니다."),
                JAVASCRIPT_UNAVAILABLE);
        Problem p = problem("java",
                "public class Solution { public static int solve(int a, int b) { return a + b; } }");

        AnswerValidator.Evaluation result = javaValidator.evaluate(
                p, "public class Solution { public static int solve(int a, int b) { return b + a; } }");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.CORRECT);
        assertThat(result.exactMatch()).isFalse();
        assertThat(result.countsAsAttempt()).isTrue();
    }

    @Test void javaCompileErrorDoesNotCountAsAttempt() {
        AnswerValidator javaValidator = new AnswerValidator(
                (problem, css) -> CssRenderingEvaluator.Result.unavailable(),
                (problem, code) -> new JavaCodeEvaluator.Result(
                        JavaCodeEvaluator.Status.COMPILE_ERROR, "Solution.java:3: error"),
                JAVASCRIPT_UNAVAILABLE);
        Problem p = problem("java", "public class Solution {}");

        AnswerValidator.Evaluation result = javaValidator.evaluate(p, "public class Solution {");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.SYNTAX);
        assertThat(result.diagnosticCode()).isEqualTo(AnswerValidator.DiagnosticCode.COMPILE_ERROR);
        assertThat(result.countsAsAttempt()).isFalse();
    }

    @Test void failedJavaTestCountsAsConceptualAttempt() {
        AnswerValidator javaValidator = new AnswerValidator(
                (problem, css) -> CssRenderingEvaluator.Result.unavailable(),
                (problem, code) -> new JavaCodeEvaluator.Result(
                        JavaCodeEvaluator.Status.TEST_FAILED,
                        "음수 입력에서 결과가 다릅니다.\n기대 결과: 3\n실행 결과: -3"),
                JAVASCRIPT_UNAVAILABLE);
        Problem p = problem("algorithm", "public class Solution {}");

        AnswerValidator.Evaluation result = javaValidator.evaluate(p, "public class Solution {}");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.INCORRECT);
        assertThat(result.diagnosticCode()).isEqualTo(AnswerValidator.DiagnosticCode.TEST_FAILURE);
        assertThat(result.countsAsAttempt()).isTrue();
    }

    @Test void sourceContractViolationCountsAsConceptualAttempt() {
        AnswerValidator javaValidator = new AnswerValidator(
                (problem, css) -> CssRenderingEvaluator.Result.unavailable(),
                (problem, code) -> new JavaCodeEvaluator.Result(
                        JavaCodeEvaluator.Status.SOURCE_CONTRACT_FAILED,
                        "현재 값을 보관하고 큰 원소를 오른쪽으로 이동한 뒤 다시 삽입하는 구조가 필요합니다."),
                JAVASCRIPT_UNAVAILABLE);
        Problem p = problem("algorithm", "public class Solution {}");

        AnswerValidator.Evaluation result = javaValidator.evaluate(p, "public class Solution {}");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.INCORRECT);
        assertThat(result.diagnosticCode()).isEqualTo(AnswerValidator.DiagnosticCode.SOURCE_CONTRACT);
        assertThat(result.countsAsAttempt()).isTrue();
        assertThat(result.guidance()).contains("오른쪽으로 이동");
    }

    @Test void gradesJavaScriptWithItsDedicatedEvaluatorAndLanguageGuidance() {
        AnswerValidator javaScriptValidator = new AnswerValidator(
                (problem, css) -> CssRenderingEvaluator.Result.unavailable(),
                JAVA_UNAVAILABLE,
                (problem, code) -> new CodeExecutionEvaluator.Result(
                        CodeExecutionEvaluator.Status.PASSED,
                        "모든 테스트를 통과했습니다."
                )
        );
        Problem p = problem("javascript", "function solve(a, b) { return a + b; }");

        AnswerValidator.Evaluation result = javaScriptValidator.evaluate(
                p,
                "function solve(a, b) { return b + a; }"
        );

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.CORRECT);
        assertThat(result.exactMatch()).isFalse();
        assertThat(result.guidance()).contains("JavaScript 실행").doesNotContain("Java 21");
    }

    @Test void reportsJavaScriptSyntaxLineWithoutCountingAnAttempt() {
        AnswerValidator javaScriptValidator = new AnswerValidator(
                (problem, css) -> CssRenderingEvaluator.Result.unavailable(),
                JAVA_UNAVAILABLE,
                (problem, code) -> new CodeExecutionEvaluator.Result(
                        CodeExecutionEvaluator.Status.COMPILE_ERROR,
                        "답안:2: 구문 오류",
                        2,
                        null
                )
        );
        Problem p = problem("javascript", "function solve() { return 1; }");

        AnswerValidator.Evaluation result = javaScriptValidator.evaluate(
                p,
                "function solve() {\n return 1;"
        );

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.SYNTAX);
        assertThat(result.diagnosticCode()).isEqualTo(AnswerValidator.DiagnosticCode.COMPILE_ERROR);
        assertThat(result.errorLine()).isEqualTo(2);
        assertThat(result.guidance()).contains("JavaScript 문법").doesNotContain("컴파일러");
        assertThat(result.countsAsAttempt()).isFalse();
    }

    @Test void mapsJavaScriptSourceContractFailureToAConceptualAttempt() {
        AnswerValidator javaScriptValidator = new AnswerValidator(
                (problem, css) -> CssRenderingEvaluator.Result.unavailable(),
                JAVA_UNAVAILABLE,
                (problem, code) -> new CodeExecutionEvaluator.Result(
                        CodeExecutionEvaluator.Status.SOURCE_CONTRACT_FAILED,
                        "reduce를 사용해 누적 과정을 표현해 주세요."
                )
        );
        Problem p = problem("javascript", "function solve(values) { return 0; }");

        AnswerValidator.Evaluation result = javaScriptValidator.evaluate(
                p,
                "function solve(values) { return 0; }"
        );

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.INCORRECT);
        assertThat(result.diagnosticCode()).isEqualTo(AnswerValidator.DiagnosticCode.SOURCE_CONTRACT);
        assertThat(result.guidance()).contains("reduce");
        assertThat(result.countsAsAttempt()).isTrue();
    }

    @Test void acceptsHtmlThatMatchesSemanticContractInsteadOfExactText() {
        Problem p = problem("html", "<main><h1>기준 제목</h1><p>기준 설명</p></main>");
        p.setValidationJson("""
                {"rules":[
                  {"selector":"main > h1","min":1,"max":1},
                  {"selector":"main > p","min":1,"max":1}
                ]}
                """);

        AnswerValidator.Evaluation result = validator.evaluate(
                p, "<main class=\"content\"><h1>다른 제목</h1><p>다른 설명</p></main>");

        assertThat(result.status()).isEqualTo(AnswerValidator.Status.CORRECT);
        assertThat(result.exactMatch()).isFalse();
    }

    @Test void htmlStructureMistakeCountsAsConceptualAttemptButUnsafeMarkupDoesNot() {
        Problem p = problem("html", "<main><h1>제목</h1></main>");
        p.setValidationJson("""
                {"rules":[{"selector":"main > h1","min":1,"max":1}]}
                """);

        AnswerValidator.Evaluation missing = validator.evaluate(p, "<main><p>제목</p></main>");
        AnswerValidator.Evaluation unsafe = validator.evaluate(
                p, "<main><h1 onclick=\"alert(1)\">제목</h1></main>");

        assertThat(missing.diagnosticCode())
                .isEqualTo(AnswerValidator.DiagnosticCode.HTML_STRUCTURE_MISMATCH);
        assertThat(missing.countsAsAttempt()).isTrue();
        assertThat(unsafe.diagnosticCode())
                .isEqualTo(AnswerValidator.DiagnosticCode.HTML_UNSAFE_CONTENT);
        assertThat(unsafe.countsAsAttempt()).isFalse();
    }

    private AnswerValidator validatorWithDiagnostic(
            boolean syntaxValid,
            CssRenderingEvaluator.DiagnosticCode diagnosticCode,
            String property,
            String value,
            String suggestedValue
    ) {
        return new AnswerValidator((problem, submittedCss) ->
                new CssRenderingEvaluator.Result(true, syntaxValid, false,
                        CssRenderingEvaluator.MatchType.NONE, property,
                        diagnosticCode, property, value, suggestedValue),
                JAVA_UNAVAILABLE, JAVASCRIPT_UNAVAILABLE);
    }

    private AnswerValidator matchingBrowserValidator(CssRenderingEvaluator.MatchType matchType) {
        return new AnswerValidator((problem, submittedCss) ->
                new CssRenderingEvaluator.Result(true, true, true, matchType, null),
                JAVA_UNAVAILABLE, JAVASCRIPT_UNAVAILABLE);
    }

    private Problem problem(String mode, String answer) {
        Problem p = new Problem();
        p.setMode(mode);
        p.setCategory("property");
        p.setHtml("<div data-preview>대상</div>");
        p.setAnswer(answer);
        return p;
    }
}
