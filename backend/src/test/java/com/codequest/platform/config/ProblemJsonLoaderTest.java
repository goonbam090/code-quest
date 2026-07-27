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
