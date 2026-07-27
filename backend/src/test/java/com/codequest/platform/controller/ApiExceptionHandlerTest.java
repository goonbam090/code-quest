package com.codequest.platform.controller;

import com.codequest.platform.dto.ApiDtos.SubmissionResponse;
import com.codequest.platform.service.ProblemService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@WebMvcTest(ProblemController.class)
@Import(ApiExceptionHandler.class)
class ApiExceptionHandlerTest {
    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private ProblemService service;

    @Test
    void returnsTheApiContractForMalformedJson() throws Exception {
        mvc.perform(post("/api/problems/selector/1/submissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.fields").isEmpty());
    }

    @Test
    void returnsFieldErrorsForInvalidRequestValues() throws Exception {
        mvc.perform(post("/api/problems/selector/1/submissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.fields.learnerKey").exists());
    }

    @Test
    void keepsUnknownEndpointsAndMethodsInsideTheApiErrorContract() throws Exception {
        mvc.perform(get("/api/does-not-exist"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("API_NOT_FOUND"));

        mvc.perform(put("/api/problems"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));
    }

    @Test
    void serializesSourceContractFailureWithoutAnswerOrSolutionFields() throws Exception {
        when(service.submit(eq("algorithm"), eq(15), any())).thenReturn(
                new SubmissionResponse(
                        false,
                        false,
                        "INCORRECT",
                        "SOURCE_CONTRACT",
                        "컴파일은 통과했지만 문제에서 요구한 알고리즘 구조와 달라요.",
                        "출제 의도: solve 본문에서 삽입 정렬을 구현합니다.",
                        "solve(int[]) 본문에 삽입 이동을 직접 작성해 주세요.",
                        null,
                        null,
                        null
                )
        );

        mvc.perform(post("/api/problems/algorithm/15/submissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"learnerKey":"learner","answer":"public class Solution {}"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(false))
                .andExpect(jsonPath("$.status").value("INCORRECT"))
                .andExpect(jsonPath("$.diagnosticCode").value("SOURCE_CONTRACT"))
                .andExpect(jsonPath("$.message")
                        .value("컴파일은 통과했지만 문제에서 요구한 알고리즘 구조와 달라요."))
                .andExpect(jsonPath("$.expectedAnswer").doesNotExist())
                .andExpect(jsonPath("$.solution").doesNotExist());
    }
}
