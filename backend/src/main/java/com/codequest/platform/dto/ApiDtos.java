package com.codequest.platform.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

public final class ApiDtos {
    private ApiDtos() {}
    public record CategoryResponse(String id, String name, String description, long count) {}
    public record TraceStepResponse(String label, String state, String detail) {}
    public record ExampleResponse(String input, String output, List<TraceStepResponse> trace) {}
    public record ProblemResponse(Long id, String category, int number, String mode, String stage,
                                  String title, String question, String html, String starterCode,
                                  List<ExampleResponse> examples, List<String> constraints,
                                  List<String> hints) {}
    public record TestCaseResponse(String visibility, int number, String label, String input,
                                   String expected, String actual, String error, boolean passed) {}
    public record TestReportResponse(int passed, int total, int publicPassed, int publicTotal,
                                     int hiddenPassed, int hiddenTotal, List<TestCaseResponse> cases) {}
    public record SelectorBreakdownResponse(String fragment, String explanation) {}
    public record SolutionLessonResponse(String summary, List<String> keyPoints,
                                         String alternative, String complexity,
                                         String referenceAnswer,
                                         List<SelectorBreakdownResponse> selectorBreakdown) {}
    public record SubmissionRequest(
            @NotBlank
            @Size(max = 100)
            @Pattern(regexp = "[A-Za-z0-9][A-Za-z0-9._:-]{0,99}")
            String learnerKey,
            @Size(max = 60_000)
            String answer
    ) {}
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record SubmissionResponse(boolean correct, boolean firstSolve, String status, String diagnosticCode,
                                     String message, String intentExplanation, String guidance,
                                     Integer errorLine, TestReportResponse testReport,
                                     SolutionLessonResponse solution) {}
    public record ProgressResponse(String learnerKey, long solved, int attempts, List<Long> solvedProblemIds) {}
}
