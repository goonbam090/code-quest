package com.codequest.platform.config;

import com.codequest.platform.model.Problem;
import com.codequest.platform.repository.LearningProgressRepository;
import com.codequest.platform.repository.ProblemRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;
import java.util.*;

@Component
public class ProblemJsonLoader implements CommandLineRunner {
    private final ProblemRepository repository;
    private final LearningProgressRepository progressRepository;
    private final ObjectMapper mapper;

    public ProblemJsonLoader(ProblemRepository repository, LearningProgressRepository progressRepository,
                             ObjectMapper mapper) {
        this.repository = repository;
        this.progressRepository = progressRepository;
        this.mapper = mapper;
    }

    @Override
    @Transactional
    public void run(String... args) throws Exception {
        for (Resource resource : new PathMatchingResourcePatternResolver().getResources("classpath:problems/*.json")) {
            JsonNode root = mapper.readTree(resource.getInputStream());
            String category = root.path("id").asText();
            Set<Integer> importedNumbers = new HashSet<>();
            for (JsonNode node : root.path("problems")) {
                int number = node.path("id").asInt();
                importedNumbers.add(number);
                Problem p = repository.findByCategoryAndNumber(category, number).orElseGet(Problem::new);
                String starterCode = node.path("starterCode").asText("");
                String validationJson = node.has("required")
                        ? mapper.writeValueAsString(node.get("required"))
                        : null;
                String examplesJson = node.has("examples")
                        ? mapper.writeValueAsString(node.get("examples"))
                        : null;
                String constraintsJson = node.has("constraints")
                        ? mapper.writeValueAsString(node.get("constraints"))
                        : null;
                String solutionJson = node.has("solution")
                        ? mapper.writeValueAsString(node.get("solution"))
                        : null;
                boolean contentChanged = p.getId() != null
                        && requiresProgressReset(p, node, starterCode, validationJson);
                if (contentChanged) {
                    progressRepository.deleteAllByProblem_IdIn(List.of(p.getId()));
                }
                p.setCategory(category); p.setNumber(number); p.setMode(node.path("mode").asText("declaration"));
                p.setStage(node.path("stage").asText("기본")); p.setTitle(node.path("title").asText());
                p.setQuestion(node.path("question").asText()); p.setHtml(node.path("html").asText());
                p.setStarterCode(starterCode);
                p.setExamplesJson(examplesJson);
                p.setConstraintsJson(constraintsJson);
                p.setSolutionJson(solutionJson);
                p.setAnswer(node.path("answer").asText());
                List<String> hints = new ArrayList<>(); node.path("hints").forEach(h -> hints.add(h.asText()));
                p.setHints(hints);
                p.setValidationJson(validationJson);
                repository.save(p);
            }

            List<Problem> staleProblems = repository.findByCategoryOrderByNumber(category).stream()
                    .filter(problem -> !importedNumbers.contains(problem.getNumber()))
                    .toList();
            if (!staleProblems.isEmpty()) {
                List<Long> staleProblemIds = staleProblems.stream().map(Problem::getId).toList();
                progressRepository.deleteAllByProblem_IdIn(staleProblemIds);
                repository.deleteAll(staleProblems);
            }
        }
    }

    static boolean requiresProgressReset(
            Problem existing,
            JsonNode imported,
            String starterCode,
            String validationJson
    ) {
        String mode = imported.path("mode").asText("declaration");
        boolean executableCodeProblem = Set.of("java", "algorithm", "javascript").contains(mode);
        boolean answerDefinesGradingContract = !"selector".equals(mode);
        return !Objects.equals(existing.getMode(), mode)
                || !Objects.equals(existing.getQuestion(), imported.path("question").asText())
                || !Objects.equals(existing.getHtml(), imported.path("html").asText())
                || (answerDefinesGradingContract
                        && !Objects.equals(existing.getAnswer(), imported.path("answer").asText()))
                || !Objects.equals(Objects.toString(existing.getStarterCode(), ""), starterCode)
                || (!executableCodeProblem && !Objects.equals(existing.getValidationJson(), validationJson));
    }
}
