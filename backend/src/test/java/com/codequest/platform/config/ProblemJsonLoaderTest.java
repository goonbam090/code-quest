package com.codequest.platform.config;

import com.codequest.platform.model.Problem;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ProblemJsonLoaderTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void keepsCodeProgressWhenOnlyHiddenTestsExpand() throws Exception {
        Problem existing = codeProblem();
        existing.setValidationJson("""
                {"className":"Solution","methodName":"solve","tests":[{"arguments":["1"],"expected":"1"}]}
                """);
        JsonNode imported = mapper.readTree("""
                {
                  "mode": "java",
                  "question": "입력을 그대로 반환하세요.",
                  "html": "",
                  "starterCode": "public class Solution {}",
                  "answer": "public class Solution {}"
                }
                """);
        String expandedTests = """
                {"className":"Solution","methodName":"solve","tests":[
                  {"arguments":["1"],"expected":"1"},
                  {"arguments":["0"],"expected":"0"}
                ]}
                """;

        assertThat(ProblemJsonLoader.requiresProgressReset(
                existing, imported, "public class Solution {}", expandedTests
        )).isFalse();
    }

    @Test
    void resetsCodeProgressWhenTheLearningContractChanges() throws Exception {
        Problem existing = codeProblem();
        JsonNode imported = mapper.readTree("""
                {
                  "mode": "java",
                  "question": "두 배를 반환하세요.",
                  "html": "",
                  "starterCode": "public class Solution {}",
                  "answer": "public class Solution {}"
                }
                """);

        assertThat(ProblemJsonLoader.requiresProgressReset(
                existing, imported, "public class Solution {}", existing.getValidationJson()
        )).isTrue();
    }

    @Test
    void keepsJavaScriptProgressWhenOnlyHiddenTestsExpand() throws Exception {
        Problem existing = codeProblem();
        existing.setMode("javascript");
        existing.setStarterCode("function solve(value) { return value; }");
        existing.setAnswer("function solve(value) { return value; }");
        existing.setValidationJson("""
                {"functionName":"solve","tests":[
                  {"id":"basic","arguments":[1],"expected":1}
                ]}
                """);
        JsonNode imported = mapper.readTree("""
                {
                  "mode": "javascript",
                  "question": "입력을 그대로 반환하세요.",
                  "html": "",
                  "starterCode": "function solve(value) { return value; }",
                  "answer": "function solve(value) { return value; }"
                }
                """);
        String expandedTests = """
                {"functionName":"solve","tests":[
                  {"id":"basic","arguments":[1],"expected":1},
                  {"id":"zero","arguments":[0],"expected":0}
                ]}
                """;

        assertThat(ProblemJsonLoader.requiresProgressReset(
                existing,
                imported,
                "function solve(value) { return value; }",
                expandedTests
        )).isFalse();
    }

    @Test
    void keepsSelectorProgressWhenOnlyTheRepresentativeAnswerChanges() throws Exception {
        Problem existing = codeProblem();
        existing.setMode("selector");
        existing.setQuestion("로그인 폼 안의 필수 입력 요소를 선택하세요.");
        existing.setHtml("""
                <form class="login">
                  <input required data-target>
                </form>
                """);
        existing.setStarterCode("");
        existing.setAnswer("form.login input[required]");
        JsonNode imported = mapper.readTree("""
                {
                  "mode": "selector",
                  "question": "로그인 폼 안의 필수 입력 요소를 선택하세요.",
                  "html": "<form class=\\"login\\">\\n  <input required data-target>\\n</form>\\n",
                  "answer": ".login input[required]"
                }
                """);

        assertThat(ProblemJsonLoader.requiresProgressReset(
                existing, imported, "", null
        )).isFalse();
    }

    @Test
    void keepsProgressWhenOnlyPublicLearningContentChanges() throws Exception {
        Problem existing = codeProblem();
        existing.setLearningJson("""
                {"keywords":["이전 키워드"],"summary":"이전 교안"}
                """);
        JsonNode imported = mapper.readTree("""
                {
                  "mode": "java",
                  "question": "입력을 그대로 반환하세요.",
                  "html": "",
                  "starterCode": "public class Solution {}",
                  "answer": "public class Solution {}",
                  "learning": {
                    "keywords": ["새 키워드"],
                    "summary": "더 구체적인 새 교안"
                  }
                }
                """);

        assertThat(ProblemJsonLoader.requiresProgressReset(
                existing, imported, "public class Solution {}", existing.getValidationJson()
        )).isFalse();
    }

    @Test
    void loadsCategoryLearningAndLetsAnExplicitProblemValueTakePrecedence() throws Exception {
        JsonNode categoryLearning = mapper.readTree("""
                {
                  "1": {"summary": "카테고리 교안"},
                  "2": {"summary": "두 번째 교안"}
                }
                """);
        JsonNode inheritedProblem = mapper.readTree("""
                {"id": 1}
                """);
        JsonNode overriddenProblem = mapper.readTree("""
                {"id": 2, "learning": {"summary": "문제별 교안"}}
                """);

        assertThat(ProblemJsonLoader.learningJson(
                inheritedProblem, categoryLearning, 1, mapper
        )).isEqualTo("{\"summary\":\"카테고리 교안\"}");
        assertThat(ProblemJsonLoader.learningJson(
                overriddenProblem, categoryLearning, 2, mapper
        )).isEqualTo("{\"summary\":\"문제별 교안\"}");
    }

    @Test
    void treatsAnExplicitNullLearningValueAsAnInvalidatingOverride() throws Exception {
        JsonNode categoryLearning = mapper.readTree("""
                {"1": {"summary": "카테고리 교안"}}
                """);
        JsonNode problem = mapper.readTree("""
                {"id": 1, "learning": null}
                """);

        assertThat(ProblemJsonLoader.learningJson(
                problem, categoryLearning, 1, mapper
        )).isNull();
    }

    private Problem codeProblem() {
        Problem problem = new Problem();
        problem.setMode("java");
        problem.setQuestion("입력을 그대로 반환하세요.");
        problem.setHtml("");
        problem.setStarterCode("public class Solution {}");
        problem.setAnswer("public class Solution {}");
        return problem;
    }
}
