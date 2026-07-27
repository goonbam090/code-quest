package com.codequest.platform.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "learning_progress", uniqueConstraints = @UniqueConstraint(columnNames = {"learner_key", "problem_id"}))
public class LearningProgress {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "learner_key", nullable = false, length = 100) private String learnerKey;
    @ManyToOne(optional = false) @JoinColumn(name = "problem_id") private Problem problem;
    @Column(nullable = false) private boolean solved;
    @Column(nullable = false) private int attempts;
    @Column(nullable = false) private Instant updatedAt;

    public Long getId() { return id; }
    public String getLearnerKey() { return learnerKey; }
    public void setLearnerKey(String learnerKey) { this.learnerKey = learnerKey; }
    public Problem getProblem() { return problem; }
    public void setProblem(Problem problem) { this.problem = problem; }
    public boolean isSolved() { return solved; }
    public void setSolved(boolean solved) { this.solved = solved; }
    public int getAttempts() { return attempts; }
    public void setAttempts(int attempts) { this.attempts = attempts; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
