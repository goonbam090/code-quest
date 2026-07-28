package com.codequest.platform.service;

import com.codequest.platform.model.Problem;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class BrowserCssRenderingEvaluatorTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void sendsStylesheetModeAndStructuredValidationToTheRenderer() throws Exception {
        AtomicReference<JsonNode> requestBody = new AtomicReference<>();
        HttpServer renderer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        renderer.createContext("/evaluate", exchange -> {
            requestBody.set(mapper.readTree(exchange.getRequestBody()));
            byte[] response = """
                    {
                      "syntaxValid": true,
                      "matched": true,
                      "matchType": "VISUAL",
                      "visualMatch": true,
                      "computedMatch": false,
                      "differingProperty": null,
                      "diagnosticCode": "NONE",
                      "diagnosticProperty": null,
                      "diagnosticValue": null,
                      "suggestedValue": null
                    }
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        renderer.start();

        try {
            BrowserCssRenderingEvaluator evaluator = new BrowserCssRenderingEvaluator(
                    mapper,
                    "http://127.0.0.1:" + renderer.getAddress().getPort()
            );
            Problem problem = new Problem();
            problem.setMode("stylesheet");
            problem.setCategory("ui");
            problem.setHtml("<button class=\"action\">저장</button>");
            problem.setAnswer(".action:hover { color: red; }");
            problem.setValidationJson("""
                    {
                      "viewports": [{"width": 800, "height": 600}],
                      "hover": [".action"],
                      "focus": ["button"]
                    }
                    """);

            CssRenderingEvaluator.Result result =
                    evaluator.evaluate(problem, ".action:hover { color: #ff0000; }");

            assertThat(result.available()).isTrue();
            assertThat(result.syntaxValid()).isTrue();
            assertThat(result.matched()).isTrue();
            assertThat(result.matchType()).isEqualTo(CssRenderingEvaluator.MatchType.VISUAL);
            JsonNode payload = requestBody.get();
            assertThat(payload.path("mode").asText()).isEqualTo("stylesheet");
            assertThat(payload.path("policy").asText()).isEqualTo("visual");
            assertThat(payload.path("validation").path("viewports").get(0).path("width").asInt())
                    .isEqualTo(800);
            assertThat(payload.path("validation").path("hover").get(0).asText())
                    .isEqualTo(".action");
            assertThat(payload.path("validation").path("focus").get(0).asText())
                    .isEqualTo("button");
        } finally {
            renderer.stop(0);
        }
    }
}
