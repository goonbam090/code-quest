package com.codequest.platform.controller;

import com.codequest.platform.dto.ApiDtos.*;
import com.codequest.platform.service.ProblemService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@Validated
@RestController
@RequestMapping("/api")
public class ProblemController {
    private static final String CATEGORY_PATTERN = "[a-z][a-z0-9-]{0,39}";
    private static final String LEARNER_KEY_PATTERN = "[A-Za-z0-9][A-Za-z0-9._:-]{0,99}";

    private final ProblemService service;

    public ProblemController(ProblemService service) {
        this.service = service;
    }

    @GetMapping("/problems")
    public List<ProblemResponse> list(
            @RequestParam(defaultValue = "selector")
            @Pattern(regexp = CATEGORY_PATTERN) String category
    ) {
        return service.list(category);
    }

    @GetMapping("/problems/{category}/{number}")
    public ProblemResponse get(
            @PathVariable @Pattern(regexp = CATEGORY_PATTERN) String category,
            @PathVariable int number
    ) {
        return service.get(category, number);
    }

    @PostMapping("/problems/{category}/{number}/submissions")
    public SubmissionResponse submit(
            @PathVariable @Pattern(regexp = CATEGORY_PATTERN) String category,
            @PathVariable int number,
            @Valid @RequestBody SubmissionRequest request
    ) {
        return service.submit(category, number, request);
    }

    @GetMapping("/progress/{learnerKey}")
    public ProgressResponse progress(
            @PathVariable
            @Size(max = 100)
            @Pattern(regexp = LEARNER_KEY_PATTERN) String learnerKey
    ) {
        return service.progress(learnerKey);
    }
}
