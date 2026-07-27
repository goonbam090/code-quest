package com.codequest.platform.model;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "problems", uniqueConstraints = @UniqueConstraint(columnNames = {"category", "problem_number"}))
public class Problem {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false) private String category;
    @Column(name = "problem_number", nullable = false) private Integer number;
    @Column(nullable = false) private String mode;
    @Column(nullable = false) private String stage;
    @Column(nullable = false) private String title;
    @Column(nullable = false, length = 2000) private String question;
    @Column(nullable = false, columnDefinition = "text") private String html;
    @Column(columnDefinition = "text") private String starterCode;
    @Column(columnDefinition = "text") private String examplesJson;
    @Column(columnDefinition = "text") private String constraintsJson;
    @Column(columnDefinition = "text") private String solutionJson;
    @Column(nullable = false, columnDefinition = "text") private String answer;
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "problem_hints", joinColumns = @JoinColumn(name = "problem_id"))
    @OrderColumn(name = "hint_order")
    @Column(name = "hint", length = 2000)
    private List<String> hints = new ArrayList<>();
    @Column(columnDefinition = "text") private String validationJson;

    public Long getId() { return id; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public Integer getNumber() { return number; }
    public void setNumber(Integer number) { this.number = number; }
    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
    public String getStage() { return stage; }
    public void setStage(String stage) { this.stage = stage; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getQuestion() { return question; }
    public void setQuestion(String question) { this.question = question; }
    public String getHtml() { return html; }
    public void setHtml(String html) { this.html = html; }
    public String getStarterCode() { return starterCode; }
    public void setStarterCode(String starterCode) { this.starterCode = starterCode; }
    public String getExamplesJson() { return examplesJson; }
    public void setExamplesJson(String examplesJson) { this.examplesJson = examplesJson; }
    public String getConstraintsJson() { return constraintsJson; }
    public void setConstraintsJson(String constraintsJson) { this.constraintsJson = constraintsJson; }
    public String getSolutionJson() { return solutionJson; }
    public void setSolutionJson(String solutionJson) { this.solutionJson = solutionJson; }
    public String getAnswer() { return answer; }
    public void setAnswer(String answer) { this.answer = answer; }
    public List<String> getHints() { return hints; }
    public void setHints(List<String> hints) { this.hints = hints; }
    public String getValidationJson() { return validationJson; }
    public void setValidationJson(String validationJson) { this.validationJson = validationJson; }
}
