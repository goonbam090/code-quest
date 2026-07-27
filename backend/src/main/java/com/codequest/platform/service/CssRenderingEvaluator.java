package com.codequest.platform.service;

import com.codequest.platform.model.Problem;

public interface CssRenderingEvaluator {
    enum MatchType {
        COMPUTED,
        VISUAL,
        NONE
    }

    enum DiagnosticCode {
        NONE,
        MALFORMED_DECLARATION,
        UNKNOWN_PROPERTY,
        INVALID_PROPERTY_VALUE,
        MISSING_UNIT,
        MISSING_REQUIRED_PROPERTY,
        VALUE_MISMATCH,
        RESULT_MISMATCH
    }

    record Result(boolean available, boolean syntaxValid, boolean matched, MatchType matchType,
                  String differingProperty, DiagnosticCode diagnosticCode, String diagnosticProperty,
                  String diagnosticValue, String suggestedValue) {
        public Result(boolean available, boolean syntaxValid, boolean matched, MatchType matchType,
                      String differingProperty) {
            this(available, syntaxValid, matched, matchType, differingProperty,
                    DiagnosticCode.NONE, null, null, null);
        }

        public static Result unavailable() {
            return new Result(false, true, false, MatchType.NONE, null,
                    DiagnosticCode.NONE, null, null, null);
        }
    }

    Result evaluate(Problem problem, String submittedCss);
}
