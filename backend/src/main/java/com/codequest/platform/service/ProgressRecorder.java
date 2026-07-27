package com.codequest.platform.service;

import com.codequest.platform.model.LearningProgress;
import com.codequest.platform.model.Problem;
import com.codequest.platform.repository.LearningProgressRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class ProgressRecorder {
    private final LearningProgressRepository progress;
    private final EntityManager entityManager;

    public ProgressRecorder(LearningProgressRepository progress, EntityManager entityManager) {
        this.progress = progress;
        this.entityManager = entityManager;
    }

    @Transactional
    public AttemptResult recordAttempt(String learnerKey, Long problemId, boolean correct) {
        progress.lockProgressKey(learnerKey + ":" + problemId);
        LearningProgress item = progress.findByLearnerKeyAndProblemId(learnerKey, problemId)
                .orElseGet(() -> {
                    LearningProgress created = new LearningProgress();
                    created.setLearnerKey(learnerKey);
                    created.setProblem(entityManager.getReference(Problem.class, problemId));
                    return created;
                });
        boolean firstSolve = correct && !item.isSolved();
        item.setAttempts(item.getAttempts() + 1);
        item.setSolved(item.isSolved() || correct);
        item.setUpdatedAt(Instant.now());
        progress.save(item);
        return new AttemptResult(firstSolve);
    }

    public record AttemptResult(boolean firstSolve) {}
}
