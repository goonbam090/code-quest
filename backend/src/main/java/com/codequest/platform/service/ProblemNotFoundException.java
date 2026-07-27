package com.codequest.platform.service;

public final class ProblemNotFoundException extends RuntimeException {
    public ProblemNotFoundException(String category, int number) {
        super("문제를 찾을 수 없습니다: " + category + "#" + number);
    }
}
