package com.codequest.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.InputStream;

import static org.assertj.core.api.Assertions.assertThat;

class HtmlIntentMatcherTest {
    private final HtmlIntentMatcher matcher = new HtmlIntentMatcher();
    private final String validation = """
            {
              "rules": [
                {"selector": "main > h1", "min": 1, "max": 1, "message": "main의 직계 h1이 필요합니다."},
                {"selector": "main > p", "min": 1, "message": "설명 문단이 필요합니다."}
              ],
              "forbidden": [
                {"selector": "main > div", "message": "의미 없는 div 대신 문단을 사용하세요."}
              ]
            }
            """;

    @Test
    void acceptsDifferentMarkupTextWhenSemanticContractMatches() {
        var result = matcher.match(validation,
                "<main><h1>Code Quest</h1><p>설명</p></main>",
                "<main class=\"content\"><h1>다른 제목</h1><p>다른 설명</p></main>");

        assertThat(result.intentMatched()).isTrue();
        assertThat(result.exactMatch()).isFalse();
        assertThat(result.matchedRules()).isEqualTo(3);
    }

    @Test
    void explainsMissingSemanticStructure() {
        var result = matcher.match(validation,
                "<main><h1>Code Quest</h1><p>설명</p></main>",
                "<main><h1>Code Quest</h1><div>설명</div></main>");

        assertThat(result.intentMatched()).isFalse();
        assertThat(result.guidance()).contains("설명 문단");
    }

    @Test
    void rejectsExecutableMarkup() {
        var result = matcher.match(validation, "<main><h1>A</h1><p>B</p></main>",
                "<main><h1>A</h1><p onclick=\"alert(1)\">B</p><script>alert(1)</script></main>");

        assertThat(result.safe()).isFalse();
    }

    @Test
    void requiresARealIsoDateInDatetimeAttribute() {
        String dateValidation = """
                {
                  "rules": [
                    {"selector": "article time[datetime]", "min": 1, "max": 1}
                  ],
                  "attributeFormats": [
                    {
                      "selector": "article time[datetime]",
                      "attribute": "datetime",
                      "format": "iso-local-date",
                      "message": "datetime은 실제 YYYY-MM-DD 날짜여야 합니다."
                    }
                  ]
                }
                """;

        var valid = matcher.match(dateValidation, "",
                "<article><time datetime=\"2026-07-26\">오늘</time></article>");
        var invalidFormat = matcher.match(dateValidation, "",
                "<article><time datetime=\"26/07/2026\">오늘</time></article>");
        var impossibleDate = matcher.match(dateValidation, "",
                "<article><time datetime=\"2026-02-30\">오늘</time></article>");

        assertThat(valid.intentMatched()).isTrue();
        assertThat(invalidFormat.intentMatched()).isFalse();
        assertThat(impossibleDate.intentMatched()).isFalse();
    }

    @Test
    void requiresLabelForToMatchTheInputId() {
        String relationValidation = """
                {
                  "rules": [
                    {"selector": "form label[for]", "min": 1, "max": 1},
                    {"selector": "form input[id]", "min": 1, "max": 1}
                  ],
                  "attributeMatches": [
                    {
                      "sourceSelector": "form label[for]",
                      "sourceAttribute": "for",
                      "targetSelector": "form input[id]",
                      "targetAttribute": "id",
                      "message": "label과 input을 연결하세요."
                    }
                  ]
                }
                """;

        var valid = matcher.match(relationValidation, "",
                "<form><label for=\"query\">검색</label><input id=\"query\"></form>");
        var mismatch = matcher.match(relationValidation, "",
                "<form><label for=\"keyword\">검색</label><input id=\"query\"></form>");

        assertThat(valid.intentMatched()).isTrue();
        assertThat(mismatch.intentMatched()).isFalse();
        assertThat(mismatch.guidance()).contains("label과 input을 연결하세요.");
    }

    @Test
    void requiresSkipLinkBeforeRepeatedNavigation() {
        String orderValidation = """
                {
                  "rules": [
                    {"selector": "a[href='#content']", "min": 1, "max": 1},
                    {"selector": "nav", "min": 1}
                  ],
                  "orders": [
                    {
                      "beforeSelector": "a[href='#content']",
                      "afterSelector": "nav",
                      "message": "바로가기 링크는 내비게이션보다 앞에 있어야 합니다."
                    }
                  ]
                }
                """;

        var valid = matcher.match(orderValidation, "",
                "<a href=\"#content\">본문</a><nav>메뉴</nav><main id=\"content\"></main>");
        var wrongOrder = matcher.match(orderValidation, "",
                "<nav>메뉴</nav><a href=\"#content\">본문</a><main id=\"content\"></main>");

        assertThat(valid.intentMatched()).isTrue();
        assertThat(wrongOrder.intentMatched()).isFalse();
    }

    @Test
    void requiresEachSectionToHaveItsOwnDirectHeading() {
        String sectionHeadingValidation = """
                {
                  "rules": [
                    {"selector": "main > section", "min": 2, "max": 2},
                    {"selector": "main > section > h2", "min": 2, "max": 2}
                  ],
                  "forbidden": [
                    {
                      "selector": "main > section:not(:has(> h2))",
                      "message": "각 section에는 직계 h2 제목이 하나씩 필요합니다."
                    }
                  ]
                }
                """;

        var validAlternative = matcher.match(sectionHeadingValidation, "",
                "<main><section><h2>기초</h2></section><section><h2>응용</h2></section></main>");
        var headingsInOneSection = matcher.match(sectionHeadingValidation, "",
                "<main><section><h2>기초</h2><h2>응용</h2></section><section></section></main>");

        assertThat(validAlternative.intentMatched()).isTrue();
        assertThat(headingsInOneSection.intentMatched()).isFalse();
        assertThat(headingsInOneSection.guidance()).contains("각 section");
    }

    @Test
    void allHtmlReferenceAnswersSatisfyTheirDeclaredContracts() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper();
        try (InputStream stream = getClass().getResourceAsStream("/problems/html.json")) {
            assertThat(stream).isNotNull();
            var catalog = objectMapper.readTree(stream);
            assertThat(catalog.path("problems")).hasSize(15);
            for (var problem : catalog.path("problems")) {
                String required = objectMapper.writeValueAsString(problem.path("required"));
                String answer = problem.path("answer").asText();
                var result = matcher.match(required, answer, answer);

                assertThat(result.intentMatched())
                        .as("html#%s %s: %s",
                                problem.path("id").asInt(),
                                problem.path("title").asText(),
                                result.guidance())
                        .isTrue();
            }
        }
    }

    @Test
    void publicHtmlLearningExamplesDoNotSolveTheirConnectedProblems() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper();
        try (InputStream stream = getClass().getResourceAsStream("/problems/html.json")) {
            assertThat(stream).isNotNull();
            var catalog = objectMapper.readTree(stream);
            var learningByProblem = catalog.path("learning");

            for (var problem : catalog.path("problems")) {
                int problemId = problem.path("id").asInt();
                String required = objectMapper.writeValueAsString(problem.path("required"));
                String answer = problem.path("answer").asText();
                var learning = learningByProblem.path(String.valueOf(problemId));

                var exampleResult = matcher.match(
                        required, answer, learning.path("example").path("code").asText());
                assertThat(exampleResult.intentMatched())
                        .as("html#%s learning.example은 연결 문제의 정답으로 통과하지 않아야 합니다.",
                                problemId)
                        .isFalse();

                int applicationIndex = 0;
                for (var application : learning.path("applications")) {
                    applicationIndex++;
                    var applicationResult = matcher.match(
                            required, answer, application.path("code").asText());
                    assertThat(applicationResult.intentMatched())
                            .as("html#%s learning.applications[%s]은 연결 문제의 정답으로 통과하지 않아야 합니다.",
                                    problemId, applicationIndex)
                            .isFalse();
                }
            }
        }
    }
}
