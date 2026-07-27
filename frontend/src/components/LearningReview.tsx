import { useState, type MouseEvent, type RefObject } from 'react'
import { createLearningConcept, createLearningGuide } from '../lib/learningConcept'
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

function openHandbookChapter(event: MouseEvent<HTMLAnchorElement>, chapterId: string) {
  const chapter = document.getElementById(chapterId)
  if (!(chapter instanceof HTMLDetailsElement)) return

  event.preventDefault()
  chapter.open = true
  const reducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  chapter.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
  chapter.querySelector<HTMLElement>(':scope > summary')?.focus({ preventScroll: true })
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
  const [openHandbookChapters, setOpenHandbookChapters] = useState(
    () => new Set<number>([0])
  )
  const concepts = new Map(problems.map(problem => [problem.id, createLearningConcept(problem)]))
  const guides = new Map(problems.map(problem => [
    problem.id,
    createLearningGuide(problem, concepts.get(problem.id))
  ]))
  const problemIndexById = new Map(problems.map((problem, problemIndex) => [
    problem.id,
    problemIndex
  ]))

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
              const problemIndex = problemIndexById.get(problem.id)!
              const number = displayNumber(problem)
              const learned = solvedIds.has(problem.id)
              const concept = concepts.get(problem.id)!
              const guide = guides.get(problem.id)!
              return <article
                className={`review-card ${learned ? 'is-complete' : 'is-upcoming'}`}
                key={problem.id}
                aria-labelledby={`review-card-title-${problem.id}`}
              >
                <span className="review-card-state">
                  <b>{learned ? '복습' : '예습'}</b>
                  {learned ? '완료한 실습' : '학습 전 실습'} {String(number).padStart(2, '0')}
                </span>
                <h4 id={`review-card-title-${problem.id}`}>{problem.title}</h4>
                <div className="review-keywords">
                  <span>핵심 키워드</span>
                  <ul aria-label={`${number}번 문제 핵심 키워드`}>
                    {guide.keywords.map(keyword => <li key={keyword}><code>{keyword}</code></li>)}
                  </ul>
                </div>
                <div className="review-concept">
                  <span>이 문제에서 배우는 것</span>
                  <p>{concept.overview}</p>
                  {concept.usage.kind === 'code'
                    ? <figure className="review-usage-example">
                      <figcaption>
                        <span>유사 사용 예시 <em>정답 예시 아님</em></span>
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
        </section>
      })}
    </section>

    <section className="review-handbook" aria-labelledby="review-handbook-title">
      <header>
        <span>LEARNING HANDBOOK · {trackLabel}</span>
        <h3 id="review-handbook-title">{categoryLabel} 학습 교안</h3>
        <p>
          문제의 정답은 공개하지 않습니다. 대신 다른 이름과 값으로 만든 예시를 읽으며
          개념의 동작 원리, 실제 활용 방식, 자주 하는 실수를 먼저 익힐 수 있습니다.
        </p>
      </header>

      <nav className="review-handbook-index" aria-label={`${categoryLabel} 학습 교안 목차`}>
        {groups.map((group, groupIndex) => {
          const chapterId = `review-handbook-stage-${groupIndex + 1}`
          return <a
            href={`#${chapterId}`}
            key={group.stage}
            onClick={event => {
              setOpenHandbookChapters(current => new Set(current).add(groupIndex))
              openHandbookChapter(event, chapterId)
            }}
          >
            <span>CHAPTER {String(groupIndex + 1).padStart(2, '0')}</span>
            <strong>{group.stage}</strong>
            <small>{group.problems.length}개 개념</small>
          </a>
        })}
      </nav>

      <div className="review-handbook-chapters">
        {groups.map((group, groupIndex) => <details
          className="review-handbook-chapter"
          id={`review-handbook-stage-${groupIndex + 1}`}
          key={group.stage}
          open={openHandbookChapters.has(groupIndex)}
          onToggle={event => {
            const isOpen = event.currentTarget.open
            setOpenHandbookChapters(current => {
              if (current.has(groupIndex) === isOpen) return current
              const next = new Set(current)
              if (isOpen) next.add(groupIndex)
              else next.delete(groupIndex)
              return next
            })
          }}
        >
          <summary>
            <span>CHAPTER {String(groupIndex + 1).padStart(2, '0')}</span>
            <strong>{group.stage}</strong>
            <small>{group.problems.length}개 문제에서 배우는 개념</small>
            <b aria-hidden="true">＋</b>
          </summary>
          <div className="review-handbook-lessons">
            {group.problems.map(problem => {
              const number = displayNumber(problem)
              const problemIndex = problemIndexById.get(problem.id)!
              const learned = solvedIds.has(problem.id)
              const concept = concepts.get(problem.id)!
              const guide = guides.get(problem.id)!
              return <article
                className="review-handbook-lesson"
                key={problem.id}
                aria-labelledby={`review-handbook-lesson-${problem.id}`}
              >
                <header>
                  <span>{String(number).padStart(2, '0')}</span>
                  <div>
                    <small>{learned ? '복습할 개념' : '풀기 전에 볼 개념'}</small>
                    <h4 id={`review-handbook-lesson-${problem.id}`}>{problem.title}</h4>
                  </div>
                </header>

                <ul
                  className="review-handbook-keywords"
                  aria-label={`${number}번 교안 핵심 키워드`}
                >
                  {guide.keywords.map(keyword => <li key={keyword}><code>{keyword}</code></li>)}
                </ul>

                <div className="review-lesson-goal">
                  <span>학습 목표</span>
                  <p>{concept.overview}</p>
                </div>

                <div className="review-lesson-grid">
                  <div>
                    <h5>개념과 동작 원리</h5>
                    <ul>
                      {concept.details.map(detail => <li key={detail}>{detail}</li>)}
                    </ul>
                  </div>
                  <div>
                    <h5>{guide.syntax.length > 0 ? '사용 예시 해석' : '사용 맥락 해석'}</h5>
                    {guide.syntax.length > 0
                      ? <dl>
                        {guide.syntax.map(item => <div key={`${item.pattern}-${item.explanation}`}>
                          <dt><code dir="ltr">{item.pattern}</code></dt>
                          <dd>{item.explanation}</dd>
                        </div>)}
                      </dl>
                      : <p className="review-lesson-context">{concept.usage.value}</p>}
                  </div>
                </div>

                <div className="review-applications">
                  <h5>응용 활용</h5>
                  <ul>
                    {guide.applications.map((application, applicationIndex) => <li
                      key={`${application.title}-${applicationIndex}`}
                    >
                      <strong>{application.title}</strong>
                      <p>{application.description}</p>
                      {application.code && <code dir="ltr">{application.code}</code>}
                    </li>)}
                  </ul>
                </div>

                {guide.pitfalls.length > 0 && <div className="review-pitfalls">
                  <h5>자주 하는 실수</h5>
                  <ul>
                    {guide.pitfalls.map(pitfall => <li key={pitfall}>{pitfall}</li>)}
                  </ul>
                </div>}

                <button
                  type="button"
                  onClick={() => onSelectProblem(problemIndex)}
                  aria-label={`${number}번 ${problem.title} 교안에서 ${learned ? '다시 풀기' : '학습 시작하기'}`}
                >
                  {learned ? '교안을 확인했으니 다시 풀기' : '교안을 확인했으니 직접 풀기'}
                  <b aria-hidden="true">→</b>
                </button>
              </article>
            })}
          </div>
        </details>)}
      </div>
    </section>
  </main>
}
