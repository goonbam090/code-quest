package com.codequest.platform.service;

import com.codequest.platform.model.Problem;

import java.util.List;

/**
 * 격리된 코드 실행기가 반환하는 언어 공통 결과 계약입니다.
 */
public interface CodeExecutionEvaluator {
    enum Status {
        PASSED,
        COMPILE_ERROR,
        TEST_FAILED,
        RUNTIME_ERROR,
        TIME_LIMIT,
        FORBIDDEN_API,
        SOURCE_CONTRACT_FAILED,
        INVALID_REQUEST,
        UNAVAILABLE
    }

    record TestCaseResult(String visibility, int number, String label, String input,
                          String expected, String actual, String error, boolean passed) {}

    record TestReport(int passed, int total, int publicPassed, int publicTotal,
                      int hiddenPassed, int hiddenTotal, List<TestCaseResult> cases) {
        public TestReport {
            cases = cases == null ? List.of() : List.copyOf(cases);
        }
    }

    record Result(Status status, String details, Integer errorLine, TestReport testReport) {
        public Result(Status status, String details) {
            this(status, details, null, null);
        }

        public static Result unavailable() {
            return unavailable("코드");
        }

        public static Result unavailable(String language) {
            return new Result(
                    Status.UNAVAILABLE,
                    language + " 채점 서비스를 사용할 수 없습니다.",
                    null,
                    null
            );
        }
    }

    Result evaluate(Problem problem, String submittedCode);
}
