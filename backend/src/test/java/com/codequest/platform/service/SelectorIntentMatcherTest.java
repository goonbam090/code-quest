package com.codequest.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SelectorIntentMatcherTest {
    private final SelectorIntentMatcher matcher = new SelectorIntentMatcher();

    @Test
    void everySelectorAnswerMatchesExactlyItsDeclaredTargets() throws Exception {
        try (InputStream input = getClass().getResourceAsStream("/problems/selector.json")) {
            assertThat(input).isNotNull();
            JsonNode problems = new ObjectMapper().readTree(input).path("problems");
            List<String> failures = new ArrayList<>();

            for (JsonNode problem : problems) {
                int number = problem.path("id").asInt();
                SelectorIntentMatcher.Result result = matcher.match(
                        problem.path("html").asText(),
                        problem.path("answer").asText()
                );
                if (!result.syntaxValid() || !result.intentMatched()) {
                    failures.add("#" + number + " valid=" + result.syntaxValid()
                            + " selected=" + result.selectedCount() + " targets=" + result.targetCount());
                }
            }

            assertThat(failures).isEmpty();
        }
    }

    @Test
    void internalTargetMarkerCannotSolveAnySelectorProblem() throws Exception {
        try (InputStream input = getClass().getResourceAsStream("/problems/selector.json")) {
            assertThat(input).isNotNull();
            JsonNode problems = new ObjectMapper().readTree(input).path("problems");
            List<String> bypassedProblems = new ArrayList<>();

            for (JsonNode problem : problems) {
                SelectorIntentMatcher.Result result = matcher.match(
                        problem.path("html").asText(),
                        "[data-target]"
                );
                if (!result.syntaxValid() || result.intentMatched()
                        || result.selectedCount() != 0 || result.targetCount() == 0) {
                    bypassedProblems.add("#" + problem.path("id").asInt()
                            + " valid=" + result.syntaxValid()
                            + " matched=" + result.intentMatched()
                            + " selected=" + result.selectedCount()
                            + " targets=" + result.targetCount());
                }
            }

            assertThat(problems).hasSize(19);
            assertThat(bypassedProblems).isEmpty();
        }
    }

    @Test
    void usesTheConciseValidAnswersAndStepByStepHintsForProblems16And17() throws Exception {
        try (InputStream input = getClass().getResourceAsStream("/problems/selector.json")) {
            assertThat(input).isNotNull();
            JsonNode problems = new ObjectMapper().readTree(input).path("problems");
            JsonNode login = findProblem(problems, 16);
            JsonNode board = findProblem(problems, 17);

            assertThat(login.path("answer").asText()).isEqualTo(".login input[required]");
            assertThat(login.path("hints").path(2).asText())
                    .contains(".signup input[required]")
                    .contains("후손");

            assertThat(board.path("answer").asText()).isEqualTo(".post:not(.notice) > a");
            assertThat(board.path("hints").path(2).asText())
                    .contains(".card:not(.featured) > a")
                    .contains(":not(...)은 제외")
                    .contains(">는 직계 자식");

            assertThat(matcher.match(
                    login.path("html").asText(),
                    "form.login input[required]"
            ).intentMatched()).isTrue();
            assertThat(matcher.match(
                    board.path("html").asText(),
                    ".post:not(.notice) > .title"
            ).intentMatched()).isTrue();
            assertThat(matcher.match(
                    login.path("html").asText(),
                    ".login [required]"
            ).intentMatched()).isFalse();
            assertThat(matcher.match(
                    board.path("html").asText(),
                    ".post:not(.notice) a"
            ).intentMatched()).isFalse();
        }
    }

    private JsonNode findProblem(JsonNode problems, int number) {
        for (JsonNode problem : problems) {
            if (problem.path("id").asInt() == number) {
                return problem;
            }
        }
        throw new AssertionError("선택자 문제를 찾을 수 없습니다: " + number);
    }
}
