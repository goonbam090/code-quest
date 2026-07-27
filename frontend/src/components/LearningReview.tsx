import type { RefObject } from 'react'
import { createLearningConcept } from '../lib/learningConcept'
import type { ProblemGroup } from '../lib/problemNavigation'
import type { Problem } from '../types'

type LearningReviewProps = {
  trackLabel: string
  categoryLabel: string
  groups: ProblemGroup[]
  solvedIds: Set<number>
  completionPercent: number
  headingRef: RefObject<HTMLHeadingElement | null>
  onBack: () => void
  onSelectProblem: (problemIndex: number) => void
}

function displayNumber(problem: Problem) {
  return problem.displayNumber ?? problem.number
}

function codeLabel(problem: Problem) {
  if (problem.mode === 'selector') return 'CSS SELECTOR'
  if (problem.mode === 'declaration') return 'CSS'
  if (problem.mode === 'html') return 'HTML'
  if (problem.mode === 'javascript') return 'JAVASCRIPT'
  return problem.mode === 'algorithm' ? 'JAVA · ALGORITHM' : 'JAVA'
}

export function LearningReview({
  trackLabel,
  categoryLabel,
  groups,
  solvedIds,
  completionPercent,
  headingRef,
  onBack,
  onSelectProblem
}: LearningReviewProps) {
  const problems = groups.flatMap(group => group.problems)
  const learnedProblems = problems.filter(problem => solvedIds.has(problem.id))
  const remainingProblems = problems.filter(problem => !solvedIds.has(problem.id))
  const concepts = new Map(problems.map(problem => [problem.id, createLearningConcept(problem)]))

  return <main id="learning-content" className="learning-review">
    <section className="review-hero">
      <button type="button" className="review-back" onClick={onBack}>← 실습으로 돌아가기</button>
      <span className="review-eyebrow">LEARNING MAP · {trackLabel}</span>
      <h2 ref={headingRef} tabIndex={-1}>{categoryLabel} 학습 지도</h2>
      <p>이 카테고리에서 배울 모든 핵심 개념을 단계별로 모았습니다. 학습 전에는 예습하고, 완료한 뒤에는 복습해 보세요.</p>
      <section className="review-summary" aria-label={`${categoryLabel} 학습 요약`}>
        <div>
          <span>전체 핵심 개념</span>
          <strong>{problems.length}</strong>
          <small>이 카테고리에서 배울 내용</small>
        </div>
        <div>
          <span>완료한 실습</span>
          <strong>{learnedProblems.length}</strong>
          <small>{remainingProblems.length}개 실습 남음</small>
        </div>
        <div>
          <span>현재 진도</span>
          <strong>{completionPercent}%</strong>
          <small>{learnedProblems.length} / {problems.length} 완료</small>
        </div>
      </section>
    </section>

    <nav className="review-stage-map" aria-label="단계별 학습 지도">
      {groups.map((group, groupIndex) => {
        const learnedCount = group.problems.filter(problem => solvedIds.has(problem.id)).length
        const stagePercent = Math.round((learnedCount / group.problems.length) * 100)
        return <a href={`#review-stage-${groupIndex + 1}`} key={group.stage}>
          <span>STEP {String(groupIndex + 1).padStart(2, '0')}</span>
          <strong>{group.stage}</strong>
          <small>{learnedCount} / {group.problems.length}개 완료</small>
          <div aria-hidden="true"><i style={{ width: `${stagePercent}%` }}/></div>
        </a>
      })}
    </nav>

    <section className="review-stage-list" aria-label="단계별 핵심 개념">
      {groups.map((group, groupIndex) => {
        const learnedCount = group.problems.filter(problem => solvedIds.has(problem.id)).length
        return <section
          className="review-stage"
          id={`review-stage-${groupIndex + 1}`}
          key={group.stage}
        >
          <header>
            <div>
              <span>STEP {String(groupIndex + 1).padStart(2, '0')}</span>
              <h3>{group.stage}</h3>
            </div>
            <p>{learnedCount} / {group.problems.length}개 완료 · {group.problems.length}개 핵심 개념</p>
          </header>
          <div className="review-card-grid">
            {group.problems.map(problem => {
              const problemIndex = problems.findIndex(item => item.id === problem.id)
              const number = displayNumber(problem)
              const learned = solvedIds.has(problem.id)
              const concept = concepts.get(problem.id)!
              return <article
                className={`review-card ${learned ? 'is-complete' : 'is-upcoming'}`}
                key={problem.id}
              >
                <span className="review-card-state">
                  <b>{learned ? '복습' : '예습'}</b>
                  {learned ? '완료한 실습' : '학습 전 실습'} {String(number).padStart(2, '0')}
                </span>
                <h4>{problem.title}</h4>
                <div className="review-concept">
                  <span>핵심 개념</span>
                  <p>{concept.overview}</p>
                  {concept.usage.kind === 'code'
                    ? <figure className="review-usage-example">
                      <figcaption>
                        <span>사용 예시</span>
                        <small>{codeLabel(problem)}</small>
                      </figcaption>
                      <pre><code dir="ltr">{concept.usage.value}</code></pre>
                      {concept.usage.note && <p>{concept.usage.note}</p>}
                    </figure>
                    : <div className="review-usage-context">
                      <span>사용 맥락</span>
                      <p>{concept.usage.value}</p>
                    </div>}
                </div>
                <div className="review-practice-context">
                  <span>직접 확인할 실습</span>
                  <small>{problem.question}</small>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectProblem(problemIndex)}
                  aria-label={`${number}번 ${problem.title} ${learned ? '다시 풀기' : '학습 시작하기'}`}
                >
                  {learned ? '다시 풀어 감각 확인' : '직접 실습 시작'} <b aria-hidden="true">→</b>
                </button>
              </article>
            })}
          </div>
          <article
            className="review-stage-notes"
            aria-labelledby={`review-stage-notes-${groupIndex + 1}`}
          >
            <header>
              <span>CONCEPT NOTES · STEP {String(groupIndex + 1).padStart(2, '0')}</span>
              <h4 id={`review-stage-notes-${groupIndex + 1}`}>
                {group.stage} 개념 더 알아보기
              </h4>
              <p>사용 예시가 어떤 원리로 동작하는지 확인하고 실습에 연결해 보세요.</p>
            </header>
            <details className="review-stage-notes-disclosure" open={groupIndex === 0}>
              <summary>
                <span>{group.problems.length}개 개념 설명</span>
                <strong>원리와 적용 방법 펼쳐보기</strong>
                <b aria-hidden="true">＋</b>
              </summary>
              <div className="review-note-list">
                {group.problems.map(problem => {
                  const number = displayNumber(problem)
                  const concept = concepts.get(problem.id)!
                  const publicExample = problem.examples[0]
                  return <section className="review-note" key={problem.id}>
                    <div className="review-note-heading">
                      <span>{String(number).padStart(2, '0')}</span>
                      <h5 aria-label={`${problem.title} 개념 설명`}>{problem.title}</h5>
                    </div>
                    <ul>
                      {concept.details.map(detail => <li key={detail}>{detail}</li>)}
                    </ul>
                    {publicExample && <dl>
                      <div>
                        <dt>공개 실행 예</dt>
                        <dd><code dir="ltr">{publicExample.input} → {publicExample.output}</code></dd>
                      </div>
                    </dl>}
                  </section>
                })}
              </div>
            </details>
          </article>
        </section>
      })}
    </section>
  </main>
}
