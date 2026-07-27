package com.codequest.platform.controller;

import com.codequest.platform.repository.ProblemRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HealthControllerTest {

    @Test
    void reportsReadyOnlyAfterTheCompleteCatalogIsAvailable() {
        ProblemRepository problems = mock(ProblemRepository.class);
        HealthController controller = new HealthController(problems, 343);

        when(problems.count()).thenReturn(342L);
        var starting = controller.health();
        assertThat(starting.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(starting.getBody().status()).isEqualTo("STARTING");

        when(problems.count()).thenReturn(343L);
        var ready = controller.health();
        assertThat(ready.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(ready.getBody().problemCount()).isEqualTo(343);
    }

    @Test
    void reportsDownWhenTheDatabaseCannotBeQueried() {
        ProblemRepository problems = mock(ProblemRepository.class);
        HealthController controller = new HealthController(problems, 343);
        when(problems.count()).thenThrow(new IllegalStateException("database unavailable"));

        var response = controller.health();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getBody().status()).isEqualTo("DOWN");
    }
}
