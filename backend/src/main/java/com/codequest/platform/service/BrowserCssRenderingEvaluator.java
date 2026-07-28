package com.codequest.platform.service;

import com.codequest.platform.model.Problem;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

@Component
public class BrowserCssRenderingEvaluator implements CssRenderingEvaluator {
    private static final Logger log = LoggerFactory.getLogger(BrowserCssRenderingEvaluator.class);

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final URI endpoint;

    public BrowserCssRenderingEvaluator(
            ObjectMapper objectMapper,
            @Value("${codequest.renderer.url:http://localhost:3001}") String rendererUrl
    ) {
        this.objectMapper = objectMapper;
        this.endpoint = URI.create(rendererUrl.replaceAll("/+$", "") + "/evaluate");
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(2))
                .build();
    }

    @Override
    public Result evaluate(Problem problem, String submittedCss) {
        try {
            JsonNode validation = problem.getValidationJson() == null
                    ? null
                    : objectMapper.readTree(problem.getValidationJson());
            boolean stylesheet = "stylesheet".equals(problem.getMode());
            RendererRequest payload = new RendererRequest(
                    problem.getHtml(),
                    problem.getAnswer(),
                    submittedCss,
                    stylesheet || "ui".equals(problem.getCategory()) ? "visual" : "computed",
                    problem.getMode(),
                    validation
            );
            HttpRequest request = HttpRequest.newBuilder(endpoint)
                    .timeout(Duration.ofSeconds(8))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("CSS renderer returned status {}: {}", response.statusCode(), response.body());
                return Result.unavailable();
            }

            RendererResponse body = objectMapper.readValue(response.body(), RendererResponse.class);
            MatchType matchType;
            try {
                matchType = MatchType.valueOf(body.matchType());
            } catch (IllegalArgumentException | NullPointerException ignored) {
                matchType = MatchType.NONE;
            }
            DiagnosticCode diagnosticCode;
            try {
                diagnosticCode = DiagnosticCode.valueOf(body.diagnosticCode());
            } catch (IllegalArgumentException | NullPointerException ignored) {
                diagnosticCode = DiagnosticCode.NONE;
            }
            return new Result(true, body.syntaxValid(), body.matched(), matchType, body.differingProperty(),
                    diagnosticCode, body.diagnosticProperty(), body.diagnosticValue(), body.suggestedValue());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return Result.unavailable();
        } catch (Exception exception) {
            log.warn("CSS renderer is unavailable: {}", exception.getMessage());
            return Result.unavailable();
        }
    }

    private record RendererRequest(String html, String expectedCss, String actualCss, String policy,
                                   String mode, JsonNode validation) {}

    private record RendererResponse(boolean syntaxValid, boolean matched, String matchType,
                                    boolean visualMatch, boolean computedMatch, String differingProperty,
                                    String diagnosticCode, String diagnosticProperty,
                                    String diagnosticValue, String suggestedValue) {}
}
