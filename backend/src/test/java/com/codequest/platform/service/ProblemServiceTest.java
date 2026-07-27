package com.codequest.platform.service;

import com.codequest.platform.model.Problem;
import com.codequest.platform.repository.LearningProgressRepository;
import com.codequest.platform.repository.ProblemRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ProblemServiceTest {

    @Test
    void hidesInternalTargetMarkersFromAllSelectorProblemResponses() throws Exception {
        ProblemRepository problems = mock(ProblemRepository.class);
        ObjectMapper mapper = new ObjectMapper();
        ProblemService service = new ProblemService(
                problems,
                mock(LearningProgressRepository.class),
                mock(ProgressRecorder.class),
                mock(AnswerValidator.class),
                mapper
        );
        List<Problem> catalog = new ArrayList<>();
        try (InputStream input = getClass().getResourceAsStream("/problems/selector.json")) {
            assertThat(input).isNotNull();
            JsonNode entries = mapper.readTree(input).path("problems");
            for (JsonNode entry : entries) {
                Problem problem = new Problem();
                problem.setCategory("selector");
                problem.setNumber(entry.path("id").asInt());
                problem.setMode(entry.path("mode").asText());
                problem.setStage(entry.path("stage").asText());
                problem.setTitle(entry.path("title").asText());
                problem.setQuestion(entry.path("question").asText());
                problem.setHtml(entry.path("html").asText());
                problem.setAnswer(entry.path("answer").asText());
                problem.setHints(List.of());
                catalog.add(problem);
            }
        }
        when(problems.findByCategoryOrderByNumber("selector")).thenReturn(catalog);

        var responses = service.list("selector");

        assertThat(responses).hasSize(35);
        assertThat(responses)
                .allSatisfy(response -> {
                    assertThat(response.html()).doesNotContain("data-target");
                    assertThat(response.html()).isNotBlank();
                });
        assertThat(catalog)
                .allSatisfy(problem -> assertThat(problem.getHtml()).contains("data-target"));
    }

    @Test
    void exposesProblemConstraintsAsPublicMetadata() {
        ProblemRepository problems = mock(ProblemRepository.class);
        ProblemService service = new ProblemService(
                problems,
                mock(LearningProgressRepository.class),
                mock(ProgressRecorder.class),
                mock(AnswerValidator.class),
                new ObjectMapper()
        );
        Problem problem = new Problem();
        problem.setCategory("algorithm");
        problem.setNumber(1);
        problem.setMode("algorithm");
        problem.setStage("기본 구현");
        problem.setTitle("자릿수 합");
        problem.setQuestion("자릿수의 합을 반환하세요.");
        problem.setHtml("");
        problem.setStarterCode("public class Solution {}");
        problem.setExamplesJson("[]");
        problem.setConstraintsJson("""
                ["0 ≤ n ≤ 1,000,000,000", "n은 int 범위의 0 이상 정수입니다."]
                """);
        problem.setAnswer("공개되면 안 되는 기준 답안");
        problem.setHints(List.of("힌트"));
        when(problems.findByCategoryOrderByNumber("algorithm")).thenReturn(List.of(problem));

        var response = service.list("algorithm").getFirst();

        assertThat(response.constraints()).containsExactly(
                "0 ≤ n ≤ 1,000,000,000",
                "n은 int 범위의 0 이상 정수입니다."
        );
        assertThat(response.hints()).containsExactly("힌트");
    }

    @Test
    void exposesSolutionLessonOnlyAfterCorrectSubmission() {
        ProblemRepository problems = mock(ProblemRepository.class);
        LearningProgressRepository progress = mock(LearningProgressRepository.class);
        ProgressRecorder progressRecorder = mock(ProgressRecorder.class);
        AnswerValidator validator = mock(AnswerValidator.class);
        ProblemService service = new ProblemService(
                problems, progress, progressRecorder, validator, new ObjectMapper());
        Problem problem = new Problem();
        problem.setCategory("algorithm");
        problem.setNumber(1);
        problem.setMode("algorithm");
        problem.setStage("기본 구현");
        problem.setTitle("두 수");
        problem.setQuestion("두 수의 합을 반환하세요.");
        problem.setHtml("");
        problem.setAnswer("숨은 답");
        problem.setHints(List.of("두 값을 더하세요."));
        problem.setSolutionJson("""
                {
                  "summary":"두 값을 직접 더합니다.",
                  "keyPoints":["덧셈 결과를 반환합니다."],
                  "alternative":"Math.addExact를 사용할 수도 있습니다.",
                  "complexity":"시간 O(1), 공간 O(1)"
                }
                """);
        when(problems.findByCategoryAndNumber("algorithm", 1)).thenReturn(Optional.of(problem));
        when(progress.findByLearnerKeyAndProblemId("learner", problem.getId())).thenReturn(Optional.empty());
        when(validator.evaluate(problem, "제출 코드")).thenReturn(
                new AnswerValidator.Evaluation(
                        AnswerValidator.Status.CORRECT, false,
                        AnswerValidator.DiagnosticCode.NONE, "테스트 통과"
                )
        );
        when(progressRecorder.recordAttempt("learner", problem.getId(), true))
                .thenReturn(new ProgressRecorder.AttemptResult(true));

        var response = service.submit(
                "algorithm", 1,
                new com.codequest.platform.dto.ApiDtos.SubmissionRequest("learner", "제출 코드")
        );

        assertThat(response.correct()).isTrue();
        assertThat(response.message()).isEqualTo("정답입니다.");
        assertThat(response.solution().summary()).isEqualTo("두 값을 직접 더합니다.");
        assertThat(response.solution().complexity()).isEqualTo("시간 O(1), 공간 O(1)");
    }

    @Test
    void exposesSelectorAnswerBreakdownOnlyAfterACorrectSubmission() {
        ProblemRepository problems = mock(ProblemRepository.class);
        LearningProgressRepository progress = mock(LearningProgressRepository.class);
        ProgressRecorder progressRecorder = mock(ProgressRecorder.class);
        AnswerValidator validator = mock(AnswerValidator.class);
        ProblemService service = new ProblemService(
                problems, progress, progressRecorder, validator, new ObjectMapper());
        Problem problem = new Problem();
        problem.setCategory("selector");
        problem.setNumber(18);
        problem.setMode("selector");
        problem.setStage("구조 응용");
        problem.setTitle("댓글");
        problem.setQuestion("삭제되지 않은 댓글의 작성자 이름만 선택하세요.");
        problem.setHtml("""
                <article class="comment">
                  <span class="author" data-target>민수</span>
                </article>
                """);
        problem.setAnswer(".comment:not([data-deleted]) .author");
        problem.setHints(List.of("제외 조건을 사용합니다."));
        problem.setSolutionJson("""
                {
                  "selectorBreakdown": [
                    {"fragment": ".comment", "explanation": "댓글을 찾습니다."},
                    {
                      "fragment": ":not([data-deleted])",
                      "explanation": "삭제되지 않은 댓글만 남깁니다."
                    },
                    {"fragment": ".author", "explanation": "작성자 이름을 선택합니다."}
                  ]
                }
                """);
        when(problems.findByCategoryAndNumber("selector", 18)).thenReturn(Optional.of(problem));
        when(validator.evaluate(problem, "correct")).thenReturn(
                new AnswerValidator.Evaluation(
                        AnswerValidator.Status.CORRECT, false,
                        AnswerValidator.DiagnosticCode.NONE, "목표 요소를 선택했습니다."
                )
        );
        when(validator.evaluate(problem, "incorrect")).thenReturn(
                new AnswerValidator.Evaluation(
                        AnswerValidator.Status.INCORRECT, false,
                        AnswerValidator.DiagnosticCode.SELECTOR_MISMATCH, "대상이 다릅니다."
                )
        );
        when(progressRecorder.recordAttempt("learner", problem.getId(), true))
                .thenReturn(new ProgressRecorder.AttemptResult(true));
        when(progressRecorder.recordAttempt("learner", problem.getId(), false))
                .thenReturn(new ProgressRecorder.AttemptResult(false));

        var publicProblem = service.get("selector", 18);
        var correct = service.submit(
                "selector", 18,
                new com.codequest.platform.dto.ApiDtos.SubmissionRequest("learner", "correct")
        );
        var incorrect = service.submit(
                "selector", 18,
                new com.codequest.platform.dto.ApiDtos.SubmissionRequest("learner", "incorrect")
        );

        assertThat(publicProblem.toString())
                .doesNotContain(".comment:not([data-deleted]) .author");
        assertThat(correct.solution()).isNotNull();
        assertThat(correct.solution().referenceAnswer())
                .isEqualTo(".comment:not([data-deleted]) .author");
        assertThat(correct.solution().selectorBreakdown())
                .extracting(
                        com.codequest.platform.dto.ApiDtos.SelectorBreakdownResponse::fragment,
                        com.codequest.platform.dto.ApiDtos.SelectorBreakdownResponse::explanation
                )
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(".comment", "댓글을 찾습니다."),
                        org.assertj.core.groups.Tuple.tuple(
                                ":not([data-deleted])", "삭제되지 않은 댓글만 남깁니다."),
                        org.assertj.core.groups.Tuple.tuple(".author", "작성자 이름을 선택합니다.")
                );
        assertThat(incorrect.solution()).isNull();
        assertThat(incorrect.toString())
                .doesNotContain(".comment:not([data-deleted]) .author");
    }

    @Test
    void explainsJavaScriptIntentAndDefaultSolutionTradeoffs() {
        ProblemRepository problems = mock(ProblemRepository.class);
        LearningProgressRepository progress = mock(LearningProgressRepository.class);
        ProgressRecorder progressRecorder = mock(ProgressRecorder.class);
        AnswerValidator validator = mock(AnswerValidator.class);
        ProblemService service = new ProblemService(
                problems, progress, progressRecorder, validator, new ObjectMapper());
        Problem problem = new Problem();
        problem.setCategory("javascript");
        problem.setNumber(1);
        problem.setMode("javascript");
        problem.setStage("배열");
        problem.setTitle("배열 합");
        problem.setQuestion("배열 원소의 합을 반환하세요.");
        problem.setHtml("");
        problem.setAnswer("function solve(values) { return 0; }");
        problem.setHints(List.of("반복하며 누적하세요."));
        when(problems.findByCategoryAndNumber("javascript", 1)).thenReturn(Optional.of(problem));
        when(validator.evaluate(problem, "function solve(values) { return 0; }")).thenReturn(
                new AnswerValidator.Evaluation(
                        AnswerValidator.Status.CORRECT,
                        true,
                        AnswerValidator.DiagnosticCode.NONE,
                        "JavaScript 실행과 모든 테스트를 통과했습니다."
                )
        );
        when(progressRecorder.recordAttempt("learner", problem.getId(), true))
                .thenReturn(new ProgressRecorder.AttemptResult(true));

        var response = service.submit(
                "javascript",
                1,
                new com.codequest.platform.dto.ApiDtos.SubmissionRequest(
                        "learner",
                        "function solve(values) { return 0; }"
                )
        );

        assertThat(response.intentExplanation())
                .contains("JavaScript 함수의 실행 결과")
                .contains("경계값");
        assertThat(response.message()).isEqualTo("정답입니다.");
        assertThat(response.solution().alternative()).contains("JavaScript 표현");
        assertThat(response.solution().complexity()).contains("Map").contains("시간·공간");
    }

    @Test
    void doesNotRecordAnAttemptWhenTheCssJudgeIsUnavailable() {
        ProblemRepository problems = mock(ProblemRepository.class);
        LearningProgressRepository progress = mock(LearningProgressRepository.class);
        ProgressRecorder progressRecorder = mock(ProgressRecorder.class);
        AnswerValidator validator = mock(AnswerValidator.class);
        ProblemService service = new ProblemService(
                problems, progress, progressRecorder, validator, new ObjectMapper());
        Problem problem = new Problem();
        problem.setCategory("property");
        problem.setNumber(1);
        problem.setMode("declaration");
        problem.setQuestion("Flex 레이아웃을 만드세요.");
        problem.setHtml("<div data-preview>대상</div>");
        problem.setAnswer("display: flex;");
        problem.setHints(List.of("display 속성을 확인하세요."));
        when(problems.findByCategoryAndNumber("property", 1)).thenReturn(Optional.of(problem));
        when(validator.evaluate(problem, "display: flex;")).thenReturn(
                new AnswerValidator.Evaluation(
                        AnswerValidator.Status.ERROR,
                        false,
                        AnswerValidator.DiagnosticCode.JUDGE_UNAVAILABLE,
                        "제출 내용은 시도 횟수에 반영하지 않았습니다. 잠시 후 다시 실행해 주세요."
                )
        );

        var response = service.submit(
                "property", 1,
                new com.codequest.platform.dto.ApiDtos.SubmissionRequest("learner", "display: flex;")
        );

        assertThat(response.correct()).isFalse();
        assertThat(response.firstSolve()).isFalse();
        assertThat(response.status()).isEqualTo("ERROR");
        assertThat(response.diagnosticCode()).isEqualTo("JUDGE_UNAVAILABLE");
        assertThat(response.message()).isEqualTo("채점 서비스를 잠시 사용할 수 없어요.");
        assertThat(response.guidance()).contains("시도 횟수에 반영하지 않았습니다");
        assertThat(response.solution()).isNull();
        verifyNoInteractions(progressRecorder);
    }

    @Test
    void recordsSourceContractFailureWithoutExposingSolution() {
        ProblemRepository problems = mock(ProblemRepository.class);
        LearningProgressRepository progress = mock(LearningProgressRepository.class);
        ProgressRecorder progressRecorder = mock(ProgressRecorder.class);
        AnswerValidator validator = mock(AnswerValidator.class);
        ProblemService service = new ProblemService(
                problems, progress, progressRecorder, validator, new ObjectMapper());
        Problem problem = new Problem();
        problem.setCategory("algorithm");
        problem.setNumber(15);
        problem.setMode("algorithm");
        problem.setQuestion("solve 본문에서 삽입 정렬을 구현하세요.");
        problem.setHtml("");
        problem.setAnswer("REFERENCE_SOLUTION_MUST_STAY_PRIVATE");
        problem.setHints(List.of("현재 값을 임시 보관하세요."));
        problem.setSolutionJson("""
                {"summary":"REFERENCE_LESSON_MUST_STAY_PRIVATE","keyPoints":[]}
                """);
        when(problems.findByCategoryAndNumber("algorithm", 15))
                .thenReturn(Optional.of(problem));
        when(validator.evaluate(problem, "제출 코드")).thenReturn(
                new AnswerValidator.Evaluation(
                        AnswerValidator.Status.INCORRECT,
                        false,
                        AnswerValidator.DiagnosticCode.SOURCE_CONTRACT,
                        "solve(int[]) 본문에 삽입 이동을 직접 작성해 주세요."
                )
        );
        when(progressRecorder.recordAttempt("learner", problem.getId(), false))
                .thenReturn(new ProgressRecorder.AttemptResult(false));

        var response = service.submit(
                "algorithm", 15,
                new com.codequest.platform.dto.ApiDtos.SubmissionRequest("learner", "제출 코드")
        );

        assertThat(response.correct()).isFalse();
        assertThat(response.firstSolve()).isFalse();
        assertThat(response.status()).isEqualTo("INCORRECT");
        assertThat(response.diagnosticCode()).isEqualTo("SOURCE_CONTRACT");
        assertThat(response.message())
                .isEqualTo("컴파일은 통과했지만 문제에서 요구한 알고리즘 구조와 달라요.");
        assertThat(response.guidance()).contains("solve(int[])");
        assertThat(response.testReport()).isNull();
        assertThat(response.solution()).isNull();
        assertThat(response.toString())
                .doesNotContain("REFERENCE_SOLUTION_MUST_STAY_PRIVATE")
                .doesNotContain("REFERENCE_LESSON_MUST_STAY_PRIVATE");
        verify(progressRecorder).recordAttempt("learner", problem.getId(), false);
    }
}
