package com.codequest.platform.repository;

import com.codequest.platform.model.LearningProgress;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface LearningProgressRepository extends JpaRepository<LearningProgress, Long> {
    @Query(value = """
            select 1
            from (
                select pg_advisory_xact_lock(hashtextextended(cast(:lockKey as text), 0))
            ) locked
            """, nativeQuery = true)
    int lockProgressKey(@Param("lockKey") String lockKey);

    Optional<LearningProgress> findByLearnerKeyAndProblemId(String learnerKey, Long problemId);
    List<LearningProgress> findByLearnerKey(String learnerKey);
    void deleteAllByProblem_IdIn(Collection<Long> problemIds);
}
