package com.codequest.platform.service;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.jsoup.select.Selector;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class SelectorIntentMatcher {
    private static final Pattern WORD_ATTRIBUTE = Pattern.compile(
            "\\[([\\w-]+)\\s*~=\\s*([\"'])([^\"']+)\\2\\]"
    );
    private static final Pattern DASH_ATTRIBUTE = Pattern.compile(
            "\\[([\\w-]+)\\s*\\|=\\s*([\"'])([^\"']+)\\2\\]"
    );
    private static final Pattern NTH_EXPRESSION = Pattern.compile(
            "(:nth-(?:child|last-child|of-type|last-of-type)\\()([^)]*)(\\))"
    );

    record Result(boolean syntaxValid, boolean intentMatched, int selectedCount, int targetCount) {}

    Result match(String html, String submittedSelector) {
        Document document = Jsoup.parseBodyFragment(html);
        Elements targets = document.body().select("[data-target]");
        targets.removeAttr("data-target");
        try {
            String selector = adaptBrowserSelector(document, submittedSelector);
            Elements selected = document.body().select(selector);
            Set<Element> selectedSet = new HashSet<>(selected);
            Set<Element> targetSet = new HashSet<>(targets);
            return new Result(true,
                    selected.size() == targets.size() && selectedSet.equals(targetSet),
                    selected.size(), targets.size());
        } catch (Selector.SelectorParseException | IllegalArgumentException exception) {
            return new Result(false, false, 0, targets.size());
        }
    }

    static String withoutInternalTargetMarkers(String html) {
        Document document = Jsoup.parseBodyFragment(html);
        document.outputSettings().prettyPrint(false);
        document.body().select("[data-target]").removeAttr("data-target");
        return document.body().html();
    }

    private String adaptBrowserSelector(Document document, String selector) {
        String adapted = adaptCaseSensitiveSimpleSelectors(document, selector)
                .replace(":where(", ":is(")
                .replace(":placeholder-shown",
                        ":is([placeholder]:not([value]),[placeholder][value=\"\"])")
                .replace(":invalid",
                        ":is([required]:not([value]),[required][value=\"\"])")
                .replace(":required", "[required]");

        Matcher matcher = WORD_ATTRIBUTE.matcher(adapted);
        StringBuilder result = new StringBuilder();
        int wordSelectorIndex = 0;
        while (matcher.find()) {
            String attribute = matcher.group(1);
            String value = matcher.group(3);
            String marker = "data-codequest-word-match-" + wordSelectorIndex++;
            for (Element element : document.body().getAllElements()) {
                if (Arrays.asList(element.attr(attribute).split("\\s+")).contains(value)) {
                    element.attr(marker, "");
                }
            }
            String replacement = "[" + marker + "]";
            matcher.appendReplacement(result, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(result);

        Matcher dashMatcher = DASH_ATTRIBUTE.matcher(result.toString());
        StringBuilder dashResult = new StringBuilder();
        int dashSelectorIndex = 0;
        while (dashMatcher.find()) {
            String attribute = dashMatcher.group(1);
            String value = dashMatcher.group(3);
            String marker = "data-codequest-dash-match-" + dashSelectorIndex++;
            for (Element element : document.body().getAllElements()) {
                String attributeValue = element.attr(attribute);
                if (element.hasAttr(attribute)
                        && (attributeValue.equals(value) || attributeValue.startsWith(value + "-"))) {
                    element.attr(marker, "");
                }
            }
            String replacement = "[" + marker + "]";
            dashMatcher.appendReplacement(dashResult, Matcher.quoteReplacement(replacement));
        }
        dashMatcher.appendTail(dashResult);

        Matcher nthMatcher = NTH_EXPRESSION.matcher(dashResult.toString());
        StringBuilder nthResult = new StringBuilder();
        while (nthMatcher.find()) {
            String replacement = nthMatcher.group(1)
                    + nthMatcher.group(2).replaceAll("\\s+", "")
                    + nthMatcher.group(3);
            nthMatcher.appendReplacement(nthResult, Matcher.quoteReplacement(replacement));
        }
        nthMatcher.appendTail(nthResult);
        return nthResult.toString();
    }

    private String adaptCaseSensitiveSimpleSelectors(Document document, String selector) {
        StringBuilder adapted = new StringBuilder();
        int markerIndex = 0;
        int bracketDepth = 0;
        char quote = 0;

        for (int index = 0; index < selector.length();) {
            char current = selector.charAt(index);
            if (quote != 0) {
                adapted.append(current);
                if (current == '\\' && index + 1 < selector.length()) {
                    adapted.append(selector.charAt(index + 1));
                    index += 2;
                    continue;
                }
                if (current == quote) {
                    quote = 0;
                }
                index++;
                continue;
            }
            if (current == '"' || current == '\'') {
                quote = current;
                adapted.append(current);
                index++;
                continue;
            }
            if (current == '[') {
                bracketDepth++;
                adapted.append(current);
                index++;
                continue;
            }
            if (current == ']') {
                bracketDepth = Math.max(0, bracketDepth - 1);
                adapted.append(current);
                index++;
                continue;
            }

            boolean classSelector = current == '.';
            boolean idSelector = current == '#';
            if (bracketDepth == 0
                    && (classSelector || idSelector)
                    && index + 1 < selector.length()
                    && isSimpleIdentifierStart(selector.charAt(index + 1))) {
                int end = index + 2;
                while (end < selector.length()
                        && isSimpleIdentifierPart(selector.charAt(end))) {
                    end++;
                }
                String name = selector.substring(index + 1, end);
                String marker = "data-codequest-"
                        + (classSelector ? "class" : "id")
                        + "-match-" + markerIndex++;
                for (Element element : document.body().getAllElements()) {
                    boolean matches = classSelector
                            ? Arrays.asList(element.className().split("\\s+")).contains(name)
                            : element.id().equals(name);
                    if (matches) {
                        element.attr(marker, "");
                    }
                }
                adapted.append('[').append(marker).append(']');
                index = end;
                continue;
            }

            adapted.append(current);
            index++;
        }
        return adapted.toString();
    }

    private boolean isSimpleIdentifierStart(char value) {
        return value == '-' || value == '_' || Character.isLetter(value) || value >= 128;
    }

    private boolean isSimpleIdentifierPart(char value) {
        return isSimpleIdentifierStart(value) || Character.isDigit(value);
    }
}
