import { type MouseEvent, type RefObject } from 'react'
import { createLearningConcept, createLearningGuide, type LearningGuide } from '../lib/learningConcept'
import {
  splitProblemGroupsIntoUnits,
  type ProblemGroup
} from '../lib/problemNavigation'
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

function formatNumber(number: number) {
  return String(number).padStart(2, '0')
}

function codeLabel(problem: Problem) {
  if (problem.mode === 'selector') return 'CSS SELECTOR'
  if (problem.mode === 'declaration') return 'CSS'
  if (problem.mode === 'html') return 'HTML'
  if (problem.mode === 'javascript') return 'JAVASCRIPT'
  return problem.mode === 'algorithm' ? 'JAVA · ALGORITHM' : 'JAVA'
}

function conceptTitle(problem: Problem, guide: LearningGuide) {
  if (problem.mode === 'html') return problem.title
  const primaryKeyword = guide.keywords[0]
  if (!primaryKeyword || problem.title.includes(primaryKeyword)) return problem.title
  return `${primaryKeyword} · ${problem.title}`
}

function focusReviewHeading(
  event: MouseEvent<HTMLAnchorElement>,
  headingId: string
) {
  const heading = document.getElementById(headingId)
  if (!(heading instanceof HTMLElement)) return

  event.preventDefault()
  const reducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  heading.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
  heading.focus({ preventScroll: true })
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
  const units = splitProblemGroupsIntoUnits(groups)
  const learnedProblems = problems.filter(problem => solvedIds.has(problem.id))
  const remainingProblems = problems.filter(problem => !solvedIds.has(problem.id))
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
      <p>
        핵심 개념을 먼저 이해하고, 5개 이하의 Quest 묶음에서 직접 사용해 보세요.
        개념 학습과 실전 연습이 하나의 순서로 이어집니다.
      </p>
      <section className="review-summary" aria-label={`${categoryLabel} 학습 요약`}>
        <div>
          <span>전체 핵심 개념</span>
          <strong>{problems.length}</strong>
          <small>순서대로 익힐 내용</small>
        </div>
        <div>
          <span>완료한 Quest</span>
          <strong>{learnedProblems.length}</strong>
          <small>{remainingProblems.length}개 Quest 남음</small>
        </div>
        <div>
          <span>현재 진도</span>
          <strong>{completionPercent}%</strong>
          <small>{learnedProblems.length} / {problems.length} 완료</small>
        </div>
      </section>
    </section>

    <nav className="review-stage-map" aria-label="5문제 단위 학습 지도">
      {units.map(unit => {
        const learnedCount = unit.problems.filter(problem => solvedIds.has(problem.id)).length
        const unitPercent = Math.round((learnedCount / unit.problems.length) * 100)
        const unitHeadingId = `review-unit-heading-${unit.id}`
        return <a
          href={`#${unitHeadingId}`}
          key={unit.id}
          onClick={event => focusReviewHeading(event, unitHeadingId)}
        >
          <span>UNIT {formatNumber(unit.number)}</span>
          <strong>Quest {formatNumber(unit.start)}–{formatNumber(unit.end)}</strong>
          <small>{unit.stage} · {learnedCount} / {unit.problems.length}개 완료</small>
          <div aria-hidden="true"><i style={{ width: `${unitPercent}%` }}/></div>
        </a>
      })}
    </nav>

    <section className="review-stage-list" aria-label="5문제 단위 실습 안내">
      {units.map(unit => {
        const learnedCount = unit.problems.filter(problem => solvedIds.has(problem.id)).length
        const unitHeadingId = `review-unit-heading-${unit.id}`
        return <section
          className="review-stage review-problem-unit"
          id={`review-unit-${unit.id}`}
          key={unit.id}
          aria-labelledby={unitHeadingId}
        >
          <header>
            <div>
              <span>UNIT {formatNumber(unit.number)}</span>
              <h3 id={unitHeadingId} tabIndex={-1}>
                {unit.stage} · Quest {formatNumber(unit.start)}–{formatNumber(unit.end)}
              </h3>
            </div>
            <p>
              Quest {formatNumber(unit.start)}–{formatNumber(unit.end)}
              {' · '}{learnedCount} / {unit.problems.length}개 완료
            </p>
          </header>
          <div className="review-card-grid">
            {unit.problems.map(problem => {
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
                  {learned ? '완료한 Quest' : '학습할 Quest'} {formatNumber(number)}
                </span>
                <h4 id={`review-card-title-${problem.id}`}>{problem.title}</h4>
                <div className="review-keywords">
                  <span>핵심 키워드</span>
                  <ul aria-label={`${number}번 문제 핵심 키워드`}>
                    {guide.keywords.map(keyword => <li key={keyword}><code>{keyword}</code></li>)}
                  </ul>
                </div>
                <div className="review-concept">
                  <span>이 Quest에서 확인할 개념</span>
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
        <span>CONCEPT CURRICULUM · {trackLabel}</span>
        <h3 id="review-handbook-title">{categoryLabel} 학습 교안</h3>
        <p>
          문제별 정답을 나열하지 않습니다. 개념이 필요한 이유부터 코드 해석과 응용까지
          순서대로 읽고, 각 개념 끝의 Quest에서 직접 사용하며 지식을 완성하세요.
        </p>
        <ol className="review-learning-cycle" aria-label="학습 교안 활용 순서">
          <li><b>1</b><span>개념 이해<small>왜 필요한지 먼저 읽기</small></span></li>
          <li><b>2</b><span>예시 해석<small>코드를 한 단계씩 읽기</small></span></li>
          <li><b>3</b><span>Quest 실전<small>직접 작성해 확인하기</small></span></li>
        </ol>
      </header>

      <nav className="review-handbook-index" aria-label={`${categoryLabel} 학습 교안 목차`}>
        {problems.map((problem, conceptIndex) => {
          const guide = guides.get(problem.id)!
          const conceptHeadingId = `review-curriculum-concept-${problem.id}`
          return <a
            href={`#${conceptHeadingId}`}
            key={problem.id}
            onClick={event => focusReviewHeading(event, conceptHeadingId)}
          >
            <span>CONCEPT {formatNumber(conceptIndex + 1)}</span>
            <strong>{conceptTitle(problem, guide)}</strong>
            <small>연결 Quest {formatNumber(displayNumber(problem))}</small>
          </a>
        })}
      </nav>

      <div className="review-curriculum">
        {groups.map((group, groupIndex) => <section
          className="review-curriculum-chapter"
          key={`${groupIndex}-${group.stage}-${group.start}-${group.end}`}
          aria-labelledby={`review-curriculum-chapter-${groupIndex + 1}`}
        >
          <header>
            <span>CHAPTER {formatNumber(groupIndex + 1)}</span>
            <h4 id={`review-curriculum-chapter-${groupIndex + 1}`}>{group.stage}</h4>
            <p>
              아래 개념은 학습 순서대로 연결됩니다. 앞 개념을 이해한 뒤 다음 개념과
              Quest로 넘어가세요.
            </p>
          </header>

          <ol className="review-curriculum-flow" aria-label={`${group.stage} 개념 학습 순서`}>
            {group.problems.map(problem => {
              const problemIndex = problemIndexById.get(problem.id)!
              const conceptIndex = problemIndex + 1
              const number = displayNumber(problem)
              const learned = solvedIds.has(problem.id)
              const concept = concepts.get(problem.id)!
              const guide = guides.get(problem.id)!
              const conceptHeadingId = `review-curriculum-concept-${problem.id}`
              return <li className="review-curriculum-topic" key={problem.id}>
                <span className="review-curriculum-marker" aria-hidden="true">
                  {formatNumber(conceptIndex)}
                </span>
                <div className="review-curriculum-body">
                  <header>
                    <small>CONCEPT {formatNumber(conceptIndex)} · {group.stage}</small>
                    <h5 id={conceptHeadingId} tabIndex={-1}>{conceptTitle(problem, guide)}</h5>
                    <p>{concept.overview}</p>
                    <ul
                      className="review-handbook-keywords"
                      aria-label={`${conceptTitle(problem, guide)} 핵심 키워드`}
                    >
                      {guide.keywords.map(keyword => <li key={keyword}><code>{keyword}</code></li>)}
                    </ul>
                  </header>

                  <div className="review-curriculum-explanation">
                    <div>
                      <h6 id={`review-principles-${problem.id}`}>왜 필요한가와 동작 원리</h6>
                      <ul>
                        {concept.details.map(detail => <li key={detail}>{detail}</li>)}
                      </ul>
                    </div>

                    <div>
                      <h6 id={`review-example-${problem.id}`}>
                        {guide.syntax.length > 0 ? '예시를 코드 순서로 읽기' : '사용 맥락 이해하기'}
                      </h6>
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
                    <h6 id={`review-applications-${problem.id}`}>실제 화면과 코드에 응용하기</h6>
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
                    <h6 id={`review-pitfalls-${problem.id}`}>자주 하는 실수</h6>
                    <ul>
                      {guide.pitfalls.map(pitfall => <li key={pitfall}>{pitfall}</li>)}
                    </ul>
                  </div>}

                  <div className={`review-curriculum-quest ${learned ? 'is-complete' : ''}`}>
                    <div>
                      <span>연결 Quest {formatNumber(number)} · {learned ? '복습' : '실전 학습'}</span>
                      <strong>{problem.title}</strong>
                      <p>{problem.question}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectProblem(problemIndex)}
                      aria-label={`Quest ${number} ${problem.title} ${learned ? '다시 풀기' : '실습하기'}`}
                    >
                      {learned ? '다시 풀어 확인' : 'Quest에서 실습'} <b aria-hidden="true">→</b>
                    </button>
                  </div>
                </div>
              </li>
            })}
          </ol>
        </section>)}
      </div>
    </section>
  </main>
}
