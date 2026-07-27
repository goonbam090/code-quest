package com.codequest.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.parser.ParseError;
import org.jsoup.parser.Parser;
import org.jsoup.select.Selector;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

final class HtmlIntentMatcher {
    private static final String DANGEROUS_ELEMENTS = "script,iframe,object,embed";
    private final ObjectMapper mapper = new ObjectMapper();

    record Result(boolean syntaxValid, boolean safe, boolean intentMatched, boolean exactMatch,
                  int matchedRules, int totalRules, String guidance) {}

    Result match(String validationJson, String expectedHtml, String submittedHtml) {
        Parser parser = Parser.htmlParser().setTrackErrors(40);
        Document submitted = Jsoup.parse(submittedHtml, "", parser);
        List<ParseError> meaningfulErrors = parser.getErrors().stream()
                .filter(error -> !error.getErrorMessage().contains("Unexpectedly reached end of file"))
                .toList();
        if (!meaningfulErrors.isEmpty()) {
            return new Result(false, true, false, false, 0, 0,
                    "HTML 태그·속성·따옴표가 올바르게 닫혔는지 확인해 보세요. "
                            + meaningfulErrors.getFirst().getErrorMessage());
        }

        Element body = submitted.body();
        if (!body.select(DANGEROUS_ELEMENTS).isEmpty() || hasEventHandler(body)) {
            return new Result(true, false, false, false, 0, 0,
                    "학습용 HTML에는 script·iframe 같은 실행 요소나 on* 이벤트 속성을 사용할 수 없습니다.");
        }

        boolean exact = canonical(expectedHtml).equals(canonical(submittedHtml));
        if (validationJson == null || validationJson.isBlank()) {
            return new Result(true, true, exact, exact, exact ? 1 : 0, 1,
                    exact ? "의도한 HTML 구조를 만들었습니다." : "요구된 태그 구조와 속성을 다시 확인해 보세요.");
        }

        try {
            JsonNode validation = mapper.readTree(validationJson);
            List<String> failures = new ArrayList<>();
            int matched = 0;
            int total = 0;

            for (JsonNode rule : validation.path("rules")) {
                total++;
                String selector = rule.path("selector").asText();
                int count = body.select(selector).size();
                int min = rule.path("min").asInt(1);
                int max = rule.has("max") ? rule.path("max").asInt() : Integer.MAX_VALUE;
                if (count >= min && count <= max) {
                    matched++;
                } else {
                    failures.add(rule.path("message").asText(
                            "`" + selector + "` 구조가 " + min + "개 이상 필요합니다."));
                }
            }

            for (JsonNode rule : validation.path("forbidden")) {
                total++;
                String selector = rule.path("selector").asText();
                if (body.select(selector).isEmpty()) {
                    matched++;
                } else {
                    failures.add(rule.path("message").asText(
                            "`" + selector + "` 요소나 속성은 이 문제에서 사용하지 않습니다."));
                }
            }

            for (JsonNode rule : validation.path("attributeFormats")) {
                total++;
                String selector = rule.path("selector").asText();
                String attribute = rule.path("attribute").asText();
                String format = rule.path("format").asText();
                List<Element> elements = body.select(selector);
                boolean valid = !elements.isEmpty() && elements.stream()
                        .allMatch(element -> attributeMatchesFormat(element.attr(attribute), format));
                if (valid) {
                    matched++;
                } else {
                    failures.add(rule.path("message").asText(
                            "`" + selector + "`의 `" + attribute + "` 값을 올바른 형식으로 작성하세요."));
                }
            }

            for (JsonNode rule : validation.path("attributeMatches")) {
                total++;
                String sourceSelector = rule.path("sourceSelector").asText();
                String sourceAttribute = rule.path("sourceAttribute").asText();
                String targetSelector = rule.path("targetSelector").asText();
                String targetAttribute = rule.path("targetAttribute").asText();
                List<Element> sources = body.select(sourceSelector);
                List<Element> targets = body.select(targetSelector);
                Set<String> sourceValues = attributeValues(sources, sourceAttribute);
                Set<String> targetValues = attributeValues(targets, targetAttribute);
                boolean valid = !sources.isEmpty() && !targets.isEmpty()
                        && sourceValues.size() == sources.size()
                        && targetValues.size() == targets.size()
                        && sourceValues.equals(targetValues);
                if (valid) {
                    matched++;
                } else {
                    failures.add(rule.path("message").asText(
                            "`" + sourceAttribute + "`와 `" + targetAttribute + "` 값을 서로 연결하세요."));
                }
            }

            for (JsonNode rule : validation.path("orders")) {
                total++;
                String beforeSelector = rule.path("beforeSelector").asText();
                String afterSelector = rule.path("afterSelector").asText();
                List<Element> before = body.select(beforeSelector);
                List<Element> after = body.select(afterSelector);
                List<Element> documentOrder = body.getAllElements();
                boolean valid = !before.isEmpty() && !after.isEmpty()
                        && before.stream().mapToInt(documentOrder::indexOf).max().orElse(Integer.MAX_VALUE)
                        < after.stream().mapToInt(documentOrder::indexOf).min().orElse(Integer.MIN_VALUE);
                if (valid) {
                    matched++;
                } else {
                    failures.add(rule.path("message").asText(
                            "`" + beforeSelector + "` 요소를 `" + afterSelector + "` 요소보다 앞에 두세요."));
                }
            }

            boolean intentMatched = total > 0 && failures.isEmpty();
            String guidance = intentMatched
                    ? exact
                        ? "의도한 시맨틱 HTML 구조와 속성을 정확히 만들었습니다."
                        : "예시 마크업과 표현은 다르지만 필요한 시맨틱 구조와 접근성 계약을 충족했습니다."
                    : failures.getFirst() + " 현재 " + matched + "/" + total + "개 구조 조건을 충족했습니다.";
            return new Result(true, true, intentMatched, exact, matched, total, guidance);
        } catch (Selector.SelectorParseException | IllegalArgumentException exception) {
            return new Result(true, true, false, exact, 0, 0,
                    "문제의 HTML 검증 규칙을 적용할 수 없습니다.");
        } catch (Exception exception) {
            return new Result(true, true, false, exact, 0, 0,
                    "HTML 구조를 비교하는 중 오류가 발생했습니다.");
        }
    }

    private boolean hasEventHandler(Element body) {
        return body.getAllElements().stream()
                .flatMap(element -> element.attributes().asList().stream())
                .anyMatch(attribute -> attribute.getKey().toLowerCase().startsWith("on"));
    }

    private boolean attributeMatchesFormat(String value, String format) {
        if (!"iso-local-date".equals(format)
                || value == null
                || !value.matches("\\d{4}-\\d{2}-\\d{2}")) {
            return false;
        }
        try {
            LocalDate.parse(value);
            return true;
        } catch (DateTimeParseException exception) {
            return false;
        }
    }

    private Set<String> attributeValues(List<Element> elements, String attribute) {
        Set<String> values = new HashSet<>();
        for (Element element : elements) {
            String value = element.attr(attribute).trim();
            if (!value.isEmpty()) values.add(value);
        }
        return values;
    }

    private String canonical(String html) {
        Document document = Jsoup.parseBodyFragment(html);
        document.outputSettings().prettyPrint(false);
        document.body().getAllElements().forEach(element -> {
            List<org.jsoup.nodes.Attribute> attributes = new ArrayList<>(element.attributes().asList());
            attributes.sort(Comparator.comparing(org.jsoup.nodes.Attribute::getKey));
            element.clearAttributes();
            attributes.forEach(attribute -> element.attr(attribute.getKey(), attribute.getValue()));
        });
        return document.body().html().replaceAll(">\\s+<", "><").trim();
    }
}
