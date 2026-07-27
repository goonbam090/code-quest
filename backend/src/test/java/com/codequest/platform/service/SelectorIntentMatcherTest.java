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

            assertThat(problems).hasSize(35);
            assertThat(bypassedProblems).isEmpty();
        }
    }
}
