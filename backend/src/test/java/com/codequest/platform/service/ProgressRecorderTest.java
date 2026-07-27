package com.codequest.platform.service;

import com.codequest.platform.model.LearningProgress;
import com.codequest.platform.model.Problem;
import com.codequest.platform.repository.LearningProgressRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProgressRecorderTest {

    @Test
    void serializesAndRecordsTheFirstSuccessfulAttempt() {
        LearningProgressRepository progress = mock(LearningProgressRepository.class);
        EntityManager entityManager = mock(EntityManager.class);
        Problem problemReference = mock(Problem.class);
        when(progress.findByLearnerKeyAndProblemId("learner", 7L)).thenReturn(Optional.empty());
        when(entityManager.getReference(Problem.class, 7L)).thenReturn(problemReference);
        ProgressRecorder recorder = new ProgressRecorder(progress, entityManager);

        var result = recorder.recordAttempt("learner", 7L, true);

        assertThat(result.firstSolve()).isTrue();
        InOrder order = inOrder(progress);
        order.verify(progress).lockProgressKey("learner:7");
        order.verify(progress).findByLearnerKeyAndProblemId("learner", 7L);
        order.verify(progress).save(org.mockito.ArgumentMatchers.argThat(item ->
                item.getAttempts() == 1 && item.isSolved() && item.getProblem() == problemReference));
    }

    @Test
    void preservesSolvedStateAndDoesNotReportAnotherFirstSolve() {
        LearningProgressRepository progress = mock(LearningProgressRepository.class);
        LearningProgress existing = new LearningProgress();
        existing.setSolved(true);
        existing.setAttempts(2);
        when(progress.findByLearnerKeyAndProblemId("learner", 7L)).thenReturn(Optional.of(existing));
        ProgressRecorder recorder = new ProgressRecorder(progress, mock(EntityManager.class));

        var result = recorder.recordAttempt("learner", 7L, false);

        assertThat(result.firstSolve()).isFalse();
        assertThat(existing.isSolved()).isTrue();
        assertThat(existing.getAttempts()).isEqualTo(3);
        verify(progress).save(existing);
    }
}
