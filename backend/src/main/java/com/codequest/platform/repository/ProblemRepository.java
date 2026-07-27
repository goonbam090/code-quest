package com.codequest.platform.repository;

import com.codequest.platform.model.Problem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ProblemRepository extends JpaRepository<Problem, Long> {
    List<Problem> findByCategoryOrderByNumber(String category);
    Optional<Problem> findByCategoryAndNumber(String category, Integer number);
    long countByCategory(String category);
}
