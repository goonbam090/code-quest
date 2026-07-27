package com.codequest.platform.controller;

import com.codequest.platform.repository.ProblemRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class HealthController {
    private static final Logger log = LoggerFactory.getLogger(HealthController.class);

    private final ProblemRepository problems;
    private final long expectedProblemCount;

    public HealthController(
            ProblemRepository problems,
            @Value("${codequest.catalog.expected-count:343}") long expectedProblemCount
    ) {
        this.problems = problems;
        this.expectedProblemCount = expectedProblemCount;
    }

    @GetMapping("/health")
    public ResponseEntity<HealthResponse> health() {
        try {
            long problemCount = problems.count();
            boolean ready = problemCount == expectedProblemCount;
            HealthResponse body = new HealthResponse(
                    ready ? "UP" : "STARTING",
                    "code-quest-api",
                    problemCount,
                    expectedProblemCount
            );
            return ResponseEntity.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).body(body);
        } catch (RuntimeException exception) {
            log.warn("Readiness check could not query the problem catalog", exception);
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(new HealthResponse("DOWN", "code-quest-api", -1, expectedProblemCount));
        }
    }

    record HealthResponse(String status, String service, long problemCount, long expectedProblemCount) {}
}
