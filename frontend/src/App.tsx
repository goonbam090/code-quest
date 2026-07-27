import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { CodeEditor, type CodeEditorHandle } from './components/CodeEditor'
import { api } from './lib/api'
import { createExecutionTrace, type ExecutionTrace } from './lib/executionTrace'
import { formatHtml } from './lib/formatHtml'
import { filterProblemGroups, groupProblemsByStage, type ProgressFilter } from './lib/problemNavigation'
import { previewDocument, previewHtmlDocument } from './lib/preview'
import { createSyntaxGuide } from './lib/syntaxGuide'
import type { Problem, Submission, TestReport } from './types'
import './styles.css'

type TrackId = 'html' | 'css' | 'javascript' | 'java' | 'algorithm'

type CategoryDefinition = {
  id: string
  label: string
  source: string
  stage?: string
}

type TrackDefinition = {
  id: TrackId
  label: string
  description: string
  categories: CategoryDefinition[]
  stages?: TrackStageDefinition[]
}

type TrackStageDefinition = {
  id: string
  label: string
  description: string
  categoryIds: string[]
}

const javaCategories: CategoryDefinition[] = [
  { id: 'java-basic', label: '기본 문법', source: 'java', stage: '변수·연산자' },
  { id: 'java-control', label: '조건·반복', source: 'java', stage: '조건문·반복문' },
  { id: 'java-string', label: '문자열·메서드', source: 'java', stage: '메서드·문자열' },
  { id: 'java-collection', label: '배열·컬렉션', source: 'java', stage: '배열·컬렉션' },
  { id: 'bridge-method', label: '타입·메서드', source: 'java-bridge', stage: '타입·메서드 연결' },
  { id: 'bridge-object', label: '객체 입문', source: 'java-bridge', stage: '객체 입문' },
  { id: 'bridge-collection', label: '컬렉션·검증', source: 'java-bridge', stage: '컬렉션·검증' },
  { id: 'applied-oop', label: '객체지향', source: 'java-advanced', stage: '객체지향 설계' },
  { id: 'applied-validation', label: '예외·검증', source: 'java-advanced', stage: '예외·검증' },
  { id: 'applied-generic', label: '제네릭·컬렉션', source: 'java-advanced', stage: '제네릭·컬렉션' },
  { id: 'applied-functional', label: '람다·스트림', source: 'java-advanced', stage: '람다·스트림' },
  { id: 'applied-modeling', label: '실무 모델링', source: 'java-advanced', stage: '실무 모델링' }
]

const tracks: TrackDefinition[] = [
  {
    id: 'html',
    label: 'HTML Quest',
    description: '문서 구조와 접근성',
    categories: [
      { id: 'html-structure', label: '문서 구조', source: 'html', stage: '문서 구조' },
      { id: 'html-form', label: '폼·접근성', source: 'html', stage: '폼·접근성' },
      { id: 'html-content', label: '콘텐츠 모델', source: 'html', stage: '콘텐츠 모델' }
    ]
  },
  {
    id: 'css',
    label: 'CSS Quest',
    description: '화면 구성과 레이아웃',
    categories: [
      { id: 'selector', label: '선택자', source: 'selector' },
      { id: 'property', label: 'CSS 속성', source: 'property' },
      { id: 'flex', label: 'Flex', source: 'flex' },
      { id: 'grid', label: 'Grid', source: 'grid' },
      { id: 'ui', label: 'UI 구현', source: 'ui' }
    ]
  },
  {
    id: 'javascript',
    label: 'JavaScript Quest',
    description: '동작과 프로그래밍 기초',
    categories: [
      { id: 'javascript-values', label: '변수·연산', source: 'javascript', stage: '변수·연산' },
      { id: 'javascript-control', label: '조건·반복', source: 'javascript', stage: '조건문·반복문' },
      { id: 'javascript-function', label: '함수·문자열', source: 'javascript', stage: '함수·문자열' },
      { id: 'javascript-data', label: '배열·객체', source: 'javascript', stage: '배열·객체' },
      { id: 'javascript-modern', label: '컬렉션·비동기', source: 'javascript', stage: 'Map·Set·비동기' }
    ]
  },
  {
    id: 'java',
    label: 'Java Quest',
    description: 'Java 기초 → Bridge → Applied',
    categories: javaCategories,
    stages: [
      {
        id: 'java-foundation',
        label: 'Java 기초',
        description: '문법과 기본 자료구조',
        categoryIds: ['java-basic', 'java-control', 'java-string', 'java-collection']
      },
      {
        id: 'java-bridge',
        label: 'Java Bridge',
        description: '문법을 객체 설계로 연결',
        categoryIds: ['bridge-method', 'bridge-object', 'bridge-collection']
      },
      {
        id: 'java-applied',
        label: 'Java Applied',
        description: '설계와 실무 문법으로 확장',
        categoryIds: [
          'applied-oop',
          'applied-validation',
          'applied-generic',
          'applied-functional',
          'applied-modeling'
        ]
      }
    ]
  },
  {
    id: 'algorithm',
    label: 'Algorithm Quest',
    description: 'Java를 활용한 문제 해결',
    categories: [
      { id: 'algorithm', label: '코딩테스트 기본', source: 'algorithm' },
      { id: 'algorithm-intermediate', label: '코딩테스트 중급', source: 'algorithm-intermediate' }
    ]
  }
]

const DEFAULT_TRACK: TrackId = 'html'
const DEFAULT_CATEGORY = 'html-structure'
const LAST_TRACK_KEY = 'codequest-last-track'
const LAST_CATEGORY_KEY = 'codequest-last-category'
const CSS_DRAFT_CATALOG_REVISION = 'css-155-v1'
const CSS_CATEGORIES = new Set(['selector', 'property', 'flex', 'grid', 'ui'])

function withDirectionalParticle(label: string) {
  const lastCharacter = label.at(-1)
  if (!lastCharacter) return label
  const codePoint = lastCharacter.charCodeAt(0)
  if (codePoint < 0xac00 || codePoint > 0xd7a3) return `${label}로`
  const finalConsonant = (codePoint - 0xac00) % 28
  return `${label}${finalConsonant === 0 || finalConsonant === 8 ? '로' : '으로'}`
}

function initialLearningLocation() {
  const savedTrack = localStorage.getItem(LAST_TRACK_KEY)
  const definition = tracks.find(item => item.id === savedTrack)
  if (!definition) return { track: DEFAULT_TRACK, category: DEFAULT_CATEGORY }

  const savedCategory = localStorage.getItem(LAST_CATEGORY_KEY)
  const category = savedCategory && definition.categories.some(item => item.id === savedCategory)
    ? savedCategory
    : definition.categories[0].id
  return { track: definition.id, category }
}

const diagnosticLabels: Record<Submission['diagnosticCode'], string> = {
  NONE: '채점 완료',
  EMPTY_ANSWER: '입력 필요',
  SELECTOR_TYPO: '선택자 오타',
  SELECTOR_SYNTAX: '선택자 문법',
  SELECTOR_MISMATCH: '선택 대상 불일치',
  HTML_SYNTAX: 'HTML 문법',
  HTML_STRUCTURE_MISMATCH: 'HTML 구조 불일치',
  HTML_UNSAFE_CONTENT: '안전하지 않은 HTML',
  PROPERTY_NAME_TYPO: '속성명 오타',
  UNKNOWN_PROPERTY: '알 수 없는 속성',
  INVALID_PROPERTY_VALUE: '지원되지 않는 값',
  MISSING_UNIT: '단위 누락',
  UNBALANCED_DELIMITER: '괄호·따옴표 오류',
  MALFORMED_DECLARATION: '선언 형식 오류',
  MISSING_REQUIRED_PROPERTY: '필요한 속성 누락',
  VALUE_MISMATCH: '목표값 불일치',
  RESULT_MISMATCH: '화면 결과 불일치',
  COMPILE_ERROR: '컴파일 오류',
  FORBIDDEN_API: '사용 제한 API',
  SOURCE_CONTRACT: '요구 구조 불일치',
  TEST_FAILURE: '테스트 실패',
  RUNTIME_ERROR: '실행 오류',
  TIME_LIMIT: '시간 초과',
  JUDGE_UNAVAILABLE: '채점기 연결 오류'
}

function learnerKey() {
  const stored = localStorage.getItem('codequest-learner')
  if (stored) return stored
  const created = createLearnerKey()
  localStorage.setItem('codequest-learner', created)
  return created
}

function createLearnerKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function savedProblem(category: string, count: number) {
  const saved = Number(localStorage.getItem(`codequest-last-${category}`))
  return Number.isInteger(saved) && saved >= 1 && saved <= count ? saved - 1 : 0
}

function isCodeProblem(problem?: Problem) {
  return problem?.mode === 'java' || problem?.mode === 'javascript' || problem?.mode === 'algorithm'
}

function isHtmlProblem(problem?: Problem) {
  return problem?.mode === 'html'
}

function starterAnswer(problem?: Problem) {
  return isCodeProblem(problem) || isHtmlProblem(problem) ? problem?.starterCode ?? '' : ''
}

function answerDraftKey(problem: Problem) {
  if (CSS_CATEGORIES.has(problem.category)) {
    return `codequest-draft-${CSS_DRAFT_CATALOG_REVISION}-${problem.id}`
  }
  return `codequest-draft-${problem.id}`
}

function initialAnswer(problem?: Problem) {
  if (!problem) return ''
  return localStorage.getItem(answerDraftKey(problem)) ?? starterAnswer(problem)
}

function ExecutionTracePanel({ trace }: { trace: ExecutionTrace }) {
  return <section className="execution-trace" aria-label="공개 예제 실행 과정">
    <div className="panel-title">
      <span>EXECUTION TRACE</span>
      <small>{trace.curated ? '값의 변화를 순서대로 따라가 보세요' : '공개 예제의 기본 흐름입니다'}</small>
    </div>
    <ol>
      {trace.steps.map((step, stepIndex) =>
        <li key={`${step.label}-${stepIndex}`}>
          <span className="trace-index">{String(stepIndex + 1).padStart(2, '0')}</span>
          <div>
            <strong>{step.label}</strong>
            <code>{step.state}</code>
            <small>{step.detail}</small>
          </div>
        </li>
      )}
    </ol>
  </section>
}

function TestReportPanel({ report }: { report: TestReport }) {
  const publicCases = report.cases.filter(testCase => testCase.visibility === 'PUBLIC')
  const hiddenFailures = report.hiddenTotal - report.hiddenPassed
  const detailCount = publicCases.length + (hiddenFailures > 0 ? 1 : 0)
  return <section className="test-report" aria-label="테스트 상세 결과">
    <div className="test-report-summary">
      <div><span>전체</span><strong>{report.passed} / {report.total}</strong></div>
      <div><span>공개</span><strong>{report.publicPassed} / {report.publicTotal}</strong></div>
      <div><span>비공개</span><strong>{report.hiddenPassed} / {report.hiddenTotal}</strong></div>
    </div>
    {detailCount > 0 && <details className="test-case-details" open={report.passed < report.total}>
      <summary>테스트별 상세 결과 <span>{detailCount}개 보기</span></summary>
      <div className="test-case-list">
        {publicCases.map((testCase, testIndex) =>
          <article
            key={`${testCase.visibility}-${testCase.number}-${testIndex}`}
            className={testCase.passed ? 'passed' : 'failed'}
          >
            <header>
              <span>{testCase.visibility === 'PUBLIC' ? `공개 ${testCase.number}` : `비공개 ${testCase.number}`}</span>
              <strong>{testCase.label}</strong>
              <b>{testCase.passed ? 'PASS' : testCase.error ? 'ERROR' : 'FAIL'}</b>
            </header>
            <dl>
              <div><dt>입력</dt><dd>{testCase.input}</dd></div>
              <div><dt>기대</dt><dd>{testCase.expected}</dd></div>
              <div><dt>실제</dt><dd>{testCase.error || testCase.actual}</dd></div>
            </dl>
          </article>
        )}
        {hiddenFailures > 0 && <article className="failed hidden-failure">
          <header>
            <span>비공개</span>
            <strong>숨은 테스트</strong>
            <b>{hiddenFailures} FAIL</b>
          </header>
          <p>총 {report.hiddenTotal}개 중 {hiddenFailures}개를 통과하지 못했습니다. 입력과 기대값은 공개하지 않으므로 경계값과 빈 입력을 확인해 보세요.</p>
        </article>}
      </div>
    </details>}
  </section>
}

function SolutionLessonPanel({ result }: { result: Submission }) {
  if (!result.correct || !result.solution) return null
  return <details className="solution-lesson">
    <summary>
      <span className="solution-lesson-title">
        <span>SOLUTION REVIEW</span>
        <strong>정답 해설과 다른 접근 보기</strong>
      </span>
      <span className="solution-toggle">열기</span>
    </summary>
    <div className="solution-lesson-content" aria-label="정답 해설">
      <p>{result.solution.summary}</p>
      {result.solution.keyPoints.length > 0 && <ul>
        {result.solution.keyPoints.map((point, pointIndex) =>
          <li key={`${point}-${pointIndex}`}>{point}</li>
        )}
      </ul>}
      <dl>
        <div><dt>다른 접근</dt><dd>{result.solution.alternative}</dd></div>
        <div><dt>복잡도·비용</dt><dd>{result.solution.complexity}</dd></div>
      </dl>
    </div>
  </details>
}

export default function App() {
  const [initialLocation] = useState(initialLearningLocation)
  const [track, setTrack] = useState<TrackId>(initialLocation.track)
  const [category, setCategory] = useState(initialLocation.category)
  const [problems, setProblems] = useState<Problem[]>([])
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState(0)
  const [solved, setSolved] = useState<Set<number>>(new Set())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('all')
  const [jumpNumber, setJumpNumber] = useState('')
  const [problemRequestRevision, setProblemRequestRevision] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const pickerToggleRef = useRef<HTMLButtonElement>(null)
  const pickerFocusFrameRef = useRef<number | null>(null)
  const problemHeadingRef = useRef<HTMLHeadingElement>(null)
  const focusProblemAfterMoveRef = useRef(false)
  const resultRef = useRef<HTMLDivElement>(null)
  const codeEditorRef = useRef<CodeEditorHandle>(null)
  const categoryRequestGenerationRef = useRef(0)
  const submissionGenerationRef = useRef(0)
  const activeSubmissionRef = useRef<number | null>(null)
  const openHomeAtFirstProblemRef = useRef(false)
  const problem = problems[index]
  const currentTrack = tracks.find(item => item.id === track) ?? tracks[0]
  const currentCategory = currentTrack.categories.find(item => item.id === category)
    ?? currentTrack.categories[0]
  const currentStage = currentTrack.stages?.find(item => item.categoryIds.includes(currentCategory.id))
  const visibleCategories = currentStage
    ? currentTrack.categories.filter(item => currentStage.categoryIds.includes(item.id))
    : currentTrack.categories
  const currentCategoryIndex = currentTrack.categories.findIndex(item => item.id === category)
  const nextCategory = currentCategoryIndex >= 0 ? currentTrack.categories[currentCategoryIndex + 1] : undefined
  const nextStage = nextCategory
    ? currentTrack.stages?.find(item => item.categoryIds.includes(nextCategory.id))
    : undefined
  const codeProblem = isCodeProblem(problem)
  const codeLanguage = problem?.mode === 'javascript' ? 'JavaScript' : 'Java'
  const visibleProblemNumber = problem?.displayNumber ?? problem?.number
  const nextStepLabel = index < problems.length - 1
    ? '다음 문제 바로 풀기'
    : nextCategory
      ? currentStage && nextStage?.id !== currentStage.id
        ? `${nextStage?.label} · ${withDirectionalParticle(nextCategory.label)} 계속하기`
        : `${withDirectionalParticle(nextCategory.label)} 계속하기`
      : ''
  const problemContext = [
    currentTrack.label,
    currentStage?.label,
    currentCategory.label,
    problem?.stage
  ].filter((item, itemIndex, items) => item && item !== items[itemIndex - 1]).join(' / ')

  const formattedHtml = useMemo(() => problem && !isCodeProblem(problem) ? formatHtml(problem.html) : '', [problem])
  const preview = useMemo(
    () => problem && !isCodeProblem(problem) ? previewDocument(problem.html, answer, problem.mode) : '',
    [problem, answer]
  )
  const htmlPreview = useMemo(
    () => problem && isHtmlProblem(problem) ? previewHtmlDocument(answer) : '',
    [problem, answer]
  )
  const syntaxGuide = useMemo(() => createSyntaxGuide(problem), [problem])
  const executionTrace = useMemo(() => createExecutionTrace(problem), [problem])
  const stageGroups = useMemo(() => groupProblemsByStage(problems), [problems])
  const visibleGroups = useMemo(
    () => filterProblemGroups(stageGroups, query, stageFilter, progressFilter, solved),
    [stageGroups, query, stageFilter, progressFilter, solved]
  )
  const categorySolved = useMemo(() => problems.filter(item => solved.has(item.id)).length, [problems, solved])
  const completionPercent = problems.length === 0 ? 0 : Math.round((categorySolved / problems.length) * 100)
  const visibleCount = visibleGroups.reduce((count, group) => count + group.problems.length, 0)

  useEffect(() => {
    const requestGeneration = ++categoryRequestGenerationRef.current
    invalidateSubmission()
    const openAtFirstProblem = openHomeAtFirstProblemRef.current
    openHomeAtFirstProblemRef.current = false
    const source = currentCategory.source
    const stage = currentCategory.stage
    const categoryKey = category
    setLoading(true)
    setError('')
    setProblems([])
    setIndex(0)
    setAnswer('')
    setResult(null)
    setPickerOpen(false)
    setQuery('')
    setStageFilter('all')
    setProgressFilter('all')
    api.problems(source)
      .then(items => {
        if (categoryRequestGenerationRef.current !== requestGeneration) return
        const scopedItems = items
          .filter(item => !stage || item.stage === stage)
          .map((item, itemIndex) => ({ ...item, displayNumber: itemIndex + 1 }))
        setProblems(scopedItems)
        const nextIndex = openAtFirstProblem ? 0 : savedProblem(categoryKey, scopedItems.length)
        setIndex(nextIndex)
        setAnswer(initialAnswer(scopedItems[nextIndex]))
      })
      .catch(e => {
        if (categoryRequestGenerationRef.current !== requestGeneration) return
        setProblems([])
        setIndex(0)
        setAnswer('')
        setError(e instanceof Error ? e.message : '문제를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (categoryRequestGenerationRef.current === requestGeneration) setLoading(false)
      })
    return () => {
      if (categoryRequestGenerationRef.current === requestGeneration) {
        categoryRequestGenerationRef.current += 1
      }
    }
  }, [category, problemRequestRevision])

  useEffect(() => {
    api.progress(learnerKey())
      .then(progress => setSolved(new Set(progress.solvedProblemIds)))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!pickerOpen) return
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => window.clearTimeout(focusTimer)
  }, [pickerOpen])

  useEffect(() => {
    if (loading || !problem || !focusProblemAfterMoveRef.current) return
    focusProblemAfterMoveRef.current = false
    requestAnimationFrame(() => problemHeadingRef.current?.focus())
  }, [loading, problem])

  useEffect(() => () => {
    if (pickerFocusFrameRef.current !== null) cancelAnimationFrame(pickerFocusFrameRef.current)
  }, [])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && event.target.matches(
        'input, textarea, [contenteditable="true"], [role="textbox"]'
      )
      if (event.key === 'Escape' && pickerOpen) {
        event.preventDefault()
        closeProblemPicker()
      }
      if (event.altKey && event.key === '/' && !typing) {
        event.preventDefault()
        openProblemPicker()
      }
      if (event.altKey && event.key === 'ArrowLeft' && !typing && index > 0) move(index - 1)
      if (event.altKey && event.key === 'ArrowRight' && !typing && index < problems.length - 1) move(index + 1)
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  })

  async function submit() {
    if (!problem || activeSubmissionRef.current !== null) return
    const submittedProblem = problem
    const submissionGeneration = ++submissionGenerationRef.current
    activeSubmissionRef.current = submissionGeneration
    setSubmitting(true)
    try {
      setError('')
      setResult(null)
      const response = await api.submit(submittedProblem, learnerKey(), answer)
      if (submissionGenerationRef.current !== submissionGeneration) return
      setResult(response)
      if (response.correct) setSolved(current => new Set(current).add(submittedProblem.id))
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      requestAnimationFrame(() => {
        if (submissionGenerationRef.current !== submissionGeneration) return
        resultRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' })
      })
    } catch (e) {
      if (submissionGenerationRef.current !== submissionGeneration) return
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
    } finally {
      if (activeSubmissionRef.current === submissionGeneration) {
        activeSubmissionRef.current = null
        setSubmitting(false)
      }
    }
  }

  function invalidateSubmission() {
    submissionGenerationRef.current += 1
    activeSubmissionRef.current = null
    setSubmitting(false)
  }

  function closeProblemPicker() {
    setPickerOpen(false)
    focusPickerToggleWhenClosed()
  }

  function openProblemPicker() {
    if (pickerFocusFrameRef.current !== null) {
      cancelAnimationFrame(pickerFocusFrameRef.current)
      pickerFocusFrameRef.current = null
    }
    setPickerOpen(true)
  }

  function focusPickerToggleWhenClosed() {
    if (pickerFocusFrameRef.current !== null) cancelAnimationFrame(pickerFocusFrameRef.current)
    pickerFocusFrameRef.current = requestAnimationFrame(() => {
      pickerFocusFrameRef.current = null
      if (!document.getElementById('problem-picker')) pickerToggleRef.current?.focus()
    })
  }

  function move(next: number) {
    if (next < 0 || next >= problems.length) return
    invalidateSubmission()
    const restorePickerFocus = pickerOpen
    setIndex(next)
    localStorage.setItem(`codequest-last-${category}`, String(next + 1))
    setAnswer(initialAnswer(problems[next]))
    setResult(null)
    setHint(0)
    setPickerOpen(false)
    if (restorePickerFocus) focusPickerToggleWhenClosed()
  }

  function jump(event: FormEvent) {
    event.preventDefault()
    const number = Number(jumpNumber)
    if (Number.isInteger(number) && number >= 1 && number <= problems.length) {
      move(number - 1)
      setJumpNumber('')
    }
  }

  function chooseTrack(nextTrack: TrackId) {
    const definition = tracks.find(item => item.id === nextTrack)
    if (!definition) return
    changeLearningLocation(nextTrack, definition.categories[0].id)
  }

  function changeCategory(nextCategory: string) {
    changeLearningLocation(track, nextCategory)
  }

  function changeLearningLocation(nextTrack: TrackId, nextCategory: string) {
    localStorage.setItem(LAST_TRACK_KEY, nextTrack)
    localStorage.setItem(LAST_CATEGORY_KEY, nextCategory)
    if (nextTrack === track && nextCategory === category) return
    categoryRequestGenerationRef.current += 1
    invalidateSubmission()
    setTrack(nextTrack)
    setCategory(nextCategory)
  }

  function goHome() {
    focusProblemAfterMoveRef.current = true
    setJumpNumber('')
    setResult(null)
    setHint(0)
    setPickerOpen(false)
    setQuery('')
    setStageFilter('all')
    setProgressFilter('all')

    if (track !== DEFAULT_TRACK || category !== DEFAULT_CATEGORY) {
      openHomeAtFirstProblemRef.current = true
      changeLearningLocation(DEFAULT_TRACK, DEFAULT_CATEGORY)
      return
    }

    localStorage.setItem(LAST_TRACK_KEY, DEFAULT_TRACK)
    localStorage.setItem(LAST_CATEGORY_KEY, DEFAULT_CATEGORY)
    invalidateSubmission()
    if (loading || error || problems.length === 0) {
      openHomeAtFirstProblemRef.current = true
      categoryRequestGenerationRef.current += 1
      setProblemRequestRevision(current => current + 1)
      return
    }

    openHomeAtFirstProblemRef.current = false
    setIndex(0)
    setAnswer(initialAnswer(problems[0]))
    requestAnimationFrame(() => {
      focusProblemAfterMoveRef.current = false
      problemHeadingRef.current?.focus()
    })
  }

  function moveToNextStep() {
    focusProblemAfterMoveRef.current = true
    if (index < problems.length - 1) {
      move(index + 1)
      return
    }
    if (nextCategory) changeCategory(nextCategory.id)
  }

  function handleEditorPrimaryAction() {
    if (activeSubmissionRef.current !== null) return
    if (result?.correct) {
      moveToNextStep()
      return
    }
    void submit()
  }

  function clearProblemQuery() {
    setQuery('')
    requestAnimationFrame(() => searchRef.current?.focus())
  }

  function updateAnswer(nextAnswer: string) {
    invalidateSubmission()
    setAnswer(nextAnswer)
    setResult(null)
    if (problem) localStorage.setItem(answerDraftKey(problem), nextAnswer)
  }

  function resetAnswer() {
    if (!problem) return
    const resetValue = starterAnswer(problem)
    if (answer !== resetValue && !window.confirm(
      resetValue ? '작성 중인 답안을 지우고 시작 코드로 복원할까요?' : '작성 중인 답안을 모두 지울까요?'
    )) return
    invalidateSubmission()
    localStorage.removeItem(answerDraftKey(problem))
    setAnswer(resetValue)
    setResult(null)
    setHint(0)
    requestAnimationFrame(() => codeEditorRef.current?.focus())
  }

  function focusErrorLine() {
    if (!result?.errorLine || !codeEditorRef.current) return
    codeEditorRef.current.focusLine(result.errorLine)
  }

  function focusAnswer() {
    if (!codeEditorRef.current) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    codeEditorRef.current.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })
    requestAnimationFrame(() => codeEditorRef.current?.focus())
  }

  return <div className="app" aria-busy={loading}>
    <a className="skip-link" href="#learning-content">학습 콘텐츠로 바로가기</a>
    <header className="app-header">
      <div>
        <p className="kicker">LEARN BY DOING</p>
        <h1>
          <button
            className="brand-home"
            type="button"
            onClick={goHome}
            aria-label="Code Quest 홈으로 이동"
          >
            Code Quest
          </button>
        </h1>
        <p className="track-caption">{currentTrack.label} · {currentTrack.description}</p>
      </div>
      <div className="score">
        <div className="score-copy">
          <strong>{categorySolved}<small> / {problems.length}</small></strong>
          <span>현재 영역 완료 · 전체 {solved.size}문제</span>
        </div>
        <div
          className="score-progress"
          role="progressbar"
          aria-label={`${currentCategory.label} 학습 진도`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={completionPercent}
        >
          <i style={{ width: `${completionPercent}%` }}/>
        </div>
        <b>{completionPercent}%</b>
      </div>
    </header>

    <nav className="tracks" aria-label="학습 트랙">
      {tracks.map((item, trackIndex) =>
        <button
          key={item.id}
          className={track === item.id ? 'active' : ''}
          aria-current={track === item.id ? 'page' : undefined}
          onClick={() => chooseTrack(item.id)}
        >
          <span>0{trackIndex + 1}</span>
          <strong>{item.label}</strong>
          <small>{item.description}</small>
        </button>
      )}
    </nav>

    {currentTrack.stages && currentStage && <nav className="track-stages" aria-label={`${currentTrack.label} 학습 단계`}>
      {currentTrack.stages.map((item, stageIndex) =>
        <button
          key={item.id}
          className={currentStage.id === item.id ? 'active' : ''}
          aria-current={currentStage.id === item.id ? 'step' : undefined}
          onClick={() => changeCategory(item.categoryIds[0])}
        >
          <span>STEP {String(stageIndex + 1).padStart(2, '0')}</span>
          <strong>{item.label}</strong>
          <small>{item.description}</small>
        </button>
      )}
    </nav>}

    <nav className="categories" aria-label="학습 카테고리">
      {visibleCategories.map((item, categoryIndex) =>
        <button
          key={item.id}
          className={category === item.id ? 'active' : ''}
          aria-current={category === item.id ? 'page' : undefined}
          onClick={() => changeCategory(item.id)}
        >
          <span>0{categoryIndex + 1}</span>{item.label}
        </button>
      )}
    </nav>

    {loading && <main className="state" id="learning-content">문제를 불러오는 중…</main>}
    {error && <div className="error" role="alert">{error}</div>}

    {!loading && problem && <main id="learning-content">
      <section className="problem-bar">
        <div className="problem-copy">
          <span className="problem-context">{problemContext}</span>
          <h2 ref={problemHeadingRef} tabIndex={-1}>{visibleProblemNumber}. {problem.title}</h2>
          <p>{problem.question}</p>
        </div>
        <div className="problem-actions">
          <button className="answer-jump" type="button" onClick={focusAnswer}>
            <span aria-hidden="true">✎</span> 답안 작성
          </button>
          <button
            ref={pickerToggleRef}
            className="problem-picker-toggle"
            type="button"
            aria-expanded={pickerOpen}
            aria-controls="problem-picker"
            onClick={() => pickerOpen ? closeProblemPicker() : openProblemPicker()}
          >
            <span>전체 문제 보기</span>
            <strong>{visibleProblemNumber} / {problems.length}</strong>
            <b aria-hidden="true">{pickerOpen ? '▲' : '▼'}</b>
          </button>
        </div>
      </section>

      {pickerOpen && <section className="problem-picker" id="problem-picker" aria-label="문제 탐색기">
        <div className="problem-picker-head">
          <div>
            <span className="navigator-eyebrow">PROBLEM NAVIGATOR</span>
            <strong>1~{problems.length} 문제 한눈에 보기</strong>
            <span>학습 단계별 범위와 문제 내용을 확인하고 바로 이동하세요.</span>
          </div>
          <div className="navigator-progress">
            <span>{completionPercent}% 완료</span>
            <div><i style={{ width: `${completionPercent}%` }}/></div>
          </div>
          <button type="button" onClick={closeProblemPicker} aria-label="문제 탐색기 닫기">×</button>
        </div>

        <div className="navigator-toolbar">
          <label className="problem-search">
            <span aria-hidden="true">⌕</span>
            <input
              ref={searchRef}
              type="search"
              aria-label="문제 검색"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="번호, 제목, 문제 내용 검색"
            />
            {query && <button type="button" onClick={clearProblemQuery} aria-label="검색어 지우기">×</button>}
          </label>
          <form className="problem-jump" onSubmit={jump}>
            <input
              type="number"
              min="1"
              max={problems.length}
              value={jumpNumber}
              onChange={event => setJumpNumber(event.target.value)}
              placeholder="번호"
              aria-label="이동할 문제 번호"
            />
            <button type="submit">바로 이동</button>
          </form>
          <div className="progress-filters" role="group" aria-label="진행 상태 필터">
            {([['all', '전체'], ['unsolved', '미완료'], ['solved', '완료']] as const).map(([value, label]) =>
              <button
                type="button"
                key={value}
                className={progressFilter === value ? 'active' : ''}
                aria-pressed={progressFilter === value}
                onClick={() => setProgressFilter(value)}
              >{label}</button>
            )}
          </div>
        </div>

        <nav className="stage-filters" aria-label="학습 단계 필터">
          <button type="button" className={stageFilter === 'all' ? 'active' : ''} aria-pressed={stageFilter === 'all'} onClick={() => setStageFilter('all')}>
            전체 <small>1–{problems.length}</small>
          </button>
          {stageGroups.map(group =>
            <button
              type="button"
              key={group.stage}
              className={stageFilter === group.stage ? 'active' : ''}
              aria-pressed={stageFilter === group.stage}
              onClick={() => setStageFilter(group.stage)}
            >
              {group.stage} <small>{group.start}–{group.end}</small>
            </button>
          )}
        </nav>

        <div className="problem-groups">
          <div className="navigator-result"><span>{visibleCount}개 문제</span><kbd>Alt</kbd> + <kbd>/</kbd> 키로 탐색기 열기</div>
          {visibleGroups.map(group => <section className="problem-group" key={group.stage}>
            <header>
              <div><h3>{group.stage}</h3><p>{group.start}번–{group.end}번 · {group.problems.length}개 표시</p></div>
              <span>{group.start}—{group.end}</span>
            </header>
            <div className="problem-list">
              {group.problems.map(item => {
                const problemIndex = problems.findIndex(problemItem => problemItem.id === item.id)
                const isSolved = solved.has(item.id)
                const problemState = problemIndex === index ? '학습 중' : isSolved ? '완료' : '시작'
                return <button
                  type="button"
                  key={item.id}
                  className={`${problemIndex === index ? 'current' : ''} ${isSolved ? 'solved' : ''}`}
                  aria-current={problemIndex === index ? 'page' : undefined}
                  aria-label={`${item.displayNumber ?? item.number}. ${item.title}, ${problemState}`}
                  onClick={() => move(problemIndex)}
                >
                  <span className="problem-number">{String(item.displayNumber ?? item.number).padStart(2, '0')}</span>
                  <span className="problem-summary"><strong>{item.title}</strong><small>{item.question}</small></span>
                  <span className="problem-state">{problemState}</span>
                </button>
              })}
            </div>
          </section>)}
          {visibleGroups.length === 0 && <div className="navigator-empty"><strong>찾는 문제가 없습니다.</strong><span>검색어나 필터를 바꿔보세요.</span></div>}
        </div>
      </section>}

      {isHtmlProblem(problem) ? <div className="workspace html-author-workspace">
        <section className="editor panel html-author">
          <div className="panel-title">
            <span>HTML EDITOR</span>
            <div className="panel-tools">
              <small className="draft-status">● 자동 저장</small>
              <button type="button" onClick={resetAnswer}>시작 코드로 복원</button>
            </div>
          </div>
          <CodeEditor
            ref={codeEditorRef}
            className="html-code-editor"
            language="html"
            aria-label="HTML 답안"
            aria-describedby="code-editor-keyboard-help"
            value={answer}
            onChange={updateAnswer}
            onSubmit={handleEditorPrimaryAction}
          />
          <div className="answer-workbench html-actions">
            <div className="panel-title answer-title"><span>VALIDATE HTML</span><button onClick={() => setHint(value => (value + 1) % problem.hints.length)}>힌트</button></div>
            <p className="hint" aria-live="polite">{problem.hints[hint]}</p>
            <button className="submit" onClick={submit} disabled={submitting} aria-busy={submitting}>
              {submitting ? 'HTML 검사 중…' : 'HTML 구조 검사'} <kbd>Ctrl/⌘↵</kbd>
            </button>
            {result && <div ref={resultRef} className={`result ${result.status.toLowerCase()}`} role="status">
              <div className="result-heading">
                <strong>{result.message}</strong>
                <span className="diagnostic-badge">{diagnosticLabels[result.diagnosticCode] ?? '채점 안내'}</span>
              </div>
              <span className="result-intent">{result.intentExplanation}</span>
              <span className="result-guidance">{result.guidance}</span>
              {result.correct && nextStepLabel && <button type="button" className="result-next" onClick={moveToNextStep}>
                <span>{nextStepLabel}</span>
                <span className="result-next-meta"><kbd>Ctrl/⌘↵</kbd><b aria-hidden="true">→</b></span>
              </button>}
              <SolutionLessonPanel result={result}/>
            </div>}
          </div>
        </section>
        <section className="preview panel html-live-preview">
          <div className="panel-title"><span>LIVE PREVIEW</span><small>스크립트와 외부 요청이 차단된 미리보기</small></div>
          <iframe title="HTML 결과 미리보기" sandbox="" srcDoc={htmlPreview}/>
        </section>
      </div> : !codeProblem ? <div className="workspace">
        <section className="editor panel html-panel">
          <div className="panel-title"><span>HTML</span><small>줄 번호 · 문법 강조 · 읽기 전용</small></div>
          <CodeEditor
            className="html-reference-viewer"
            language="html"
            aria-label="자동 들여쓰기된 HTML 코드"
            value={formattedHtml}
            onChange={() => undefined}
            readOnly
          />
        </section>
        <section className="preview panel">
          <div className="panel-title"><span>LIVE PREVIEW</span><small>{problem.mode === 'selector' ? '보라색이 선택 결과입니다' : '입력 즉시 적용됩니다'}</small></div>
          <iframe title="CSS 결과 미리보기" sandbox="" srcDoc={preview} />
          <div className="answer-workbench">
            <div className="panel-title answer-title">
              <span>CSS 답안</span>
              <div className="panel-tools">
                <small className="draft-status">● 자동 저장</small>
                <button type="button" onClick={resetAnswer}>답안 지우기</button>
                <button type="button" onClick={() => setHint(value => (value + 1) % problem.hints.length)}>힌트</button>
              </div>
            </div>
            <CodeEditor
              ref={codeEditorRef}
              className="css-answer-editor"
              language="css"
              cssSyntaxMode={problem.mode === 'selector' ? 'stylesheet' : 'declarations'}
              aria-label="CSS 답안"
              aria-describedby="code-editor-keyboard-help"
              value={answer}
              onChange={updateAnswer}
              placeholder={problem.mode === 'selector' ? '.target' : 'display: flex;'}
              onSubmit={handleEditorPrimaryAction}
            />
            <p className="hint" aria-live="polite">{problem.hints[hint]}</p>
            <button className="submit" onClick={submit} disabled={submitting} aria-busy={submitting}>
              {submitting ? '채점 중…' : '정답 확인'} <kbd>Ctrl/⌘↵</kbd>
            </button>
            {result && <div ref={resultRef} className={`result ${result.status.toLowerCase()}`} role="status">
              <div className="result-heading">
                <strong>{result.message}</strong>
                <span className="diagnostic-badge">{diagnosticLabels[result.diagnosticCode] ?? '채점 안내'}</span>
              </div>
              <span className="result-intent">{result.intentExplanation}</span>
              <span className="result-guidance">{result.guidance}</span>
              {result.correct && nextStepLabel && <button type="button" className="result-next" onClick={moveToNextStep}>
                <span>{nextStepLabel}</span>
                <span className="result-next-meta"><kbd>Ctrl/⌘↵</kbd><b aria-hidden="true">→</b></span>
              </button>}
              <SolutionLessonPanel result={result}/>
            </div>}
          </div>
        </section>
      </div> : <div className="workspace code-workspace">
        <section className="editor panel code-reference">
          <div className="panel-title">
            <span>{problem.mode === 'javascript' ? 'FUNCTION CONTRACT' : 'METHOD CONTRACT'}</span>
            <small>{problem.mode === 'javascript' ? '함수 형태' : '메서드 형태'} · 읽기 전용</small>
          </div>
          <CodeEditor
            className="contract-code-viewer"
            language={problem.mode === 'javascript' ? 'javascript' : 'java'}
            aria-label={`${codeLanguage} 시작 코드`}
            value={problem.starterCode}
            onChange={() => undefined}
            readOnly
          />
          {problem.constraints.length > 0 && <section className="constraints" aria-label="문제 제한사항">
            <div className="panel-title"><span>CONSTRAINTS</span><small>입력 크기에서 풀이 방향을 추론해 보세요</small></div>
            <ul>
              {problem.constraints.map((constraint, constraintIndex) =>
                <li key={`${problem.id}-constraint-${constraintIndex}`}>{constraint}</li>
              )}
            </ul>
          </section>}
          <div className="examples">
            <div className="panel-title"><span>PUBLIC EXAMPLES</span><small>숨은 테스트는 서버에서만 실행됩니다</small></div>
            {problem.examples.map((example, exampleIndex) =>
              <div className="example-card" key={`${problem.id}-${exampleIndex}`}>
                <span>예시 {exampleIndex + 1}</span>
                <dl>
                  <div><dt>입력</dt><dd>{example.input}</dd></div>
                  <div><dt>출력</dt><dd>{example.output}</dd></div>
                </dl>
              </div>
            )}
          </div>
          {syntaxGuide && <section className="syntax-guide" aria-label={`${codeLanguage} 문법 사용 예시`}>
            <div className="panel-title">
              <span>QUICK SYNTAX</span>
              <small>정답이 아닌 문법 구조 예시입니다</small>
            </div>
            <div className="syntax-card">
              <div className="syntax-topics">
                {syntaxGuide.topics.map(topic => <span key={topic}>{topic}</span>)}
              </div>
              <CodeEditor
                className="syntax-code-viewer"
                language={problem.mode === 'javascript' ? 'javascript' : 'java'}
                aria-label={`${codeLanguage} 문법 예시 코드`}
                value={syntaxGuide.code}
                onChange={() => undefined}
                readOnly
              />
              <p>형태만 참고해 현재 문제의 변수와 조건에 맞게 바꿔보세요.</p>
            </div>
          </section>}
          {executionTrace && <ExecutionTracePanel trace={executionTrace}/>}
        </section>
        <section className="preview panel code-solution">
          <div className="panel-title">
            <span>{codeLanguage.toUpperCase()} EDITOR</span>
            <div className="panel-tools">
              <small className="draft-status">● 자동 저장</small>
              <button type="button" onClick={resetAnswer}>시작 코드로 복원</button>
            </div>
          </div>
          <CodeEditor
            ref={codeEditorRef}
            className="code-editor"
            language={problem.mode === 'javascript' ? 'javascript' : 'java'}
            aria-label={`${codeLanguage} 답안`}
            aria-describedby="code-editor-keyboard-help"
            aria-invalid={result?.errorLine ? true : undefined}
            value={answer}
            onChange={updateAnswer}
            onSubmit={handleEditorPrimaryAction}
          />
          {result?.errorLine && <section
            className="code-error-location"
            aria-label={problem.mode === 'javascript' ? '구문 오류 위치' : '컴파일 오류 위치'}
          >
            <div>
              <span>{problem.mode === 'javascript' ? '구문 오류 위치' : '컴파일 오류 위치'}</span>
              <strong>{result.errorLine}번째 줄</strong>
            </div>
            <code>{answer.split('\n')[result.errorLine - 1]?.trim() || '(빈 줄)'}</code>
            <button type="button" onClick={focusErrorLine}>오류 줄 선택</button>
          </section>}
          <div className="answer-workbench code-actions">
            <div className="panel-title answer-title">
              <span>{problem.mode === 'javascript' ? 'RUN & TEST' : 'COMPILE & TEST'}</span>
              <button onClick={() => setHint(value => (value + 1) % problem.hints.length)}>힌트</button>
            </div>
            <p className="hint" aria-live="polite">{problem.hints[hint]}</p>
            <button className="submit" onClick={submit} disabled={submitting} aria-busy={submitting}>
              {submitting ? '실행 중…' : '코드 실행 및 채점'} <kbd>Ctrl/⌘↵</kbd>
            </button>
            {result && <div ref={resultRef} className={`result ${result.status.toLowerCase()}`} role="status">
              <div className="result-heading">
                <strong>{result.message}</strong>
                <span className="diagnostic-badge">{diagnosticLabels[result.diagnosticCode] ?? '채점 안내'}</span>
              </div>
              <span className="result-intent">{result.intentExplanation}</span>
              <span className="result-guidance">{result.guidance}</span>
              {result.correct && nextStepLabel && <button type="button" className="result-next" onClick={moveToNextStep}>
                <span>{nextStepLabel}</span>
                <span className="result-next-meta"><kbd>Ctrl/⌘↵</kbd><b aria-hidden="true">→</b></span>
              </button>}
              {result.testReport && <TestReportPanel report={result.testReport}/>}
              <SolutionLessonPanel result={result}/>
            </div>}
          </div>
        </section>
      </div>}

      <footer>
        <button disabled={index === 0} onClick={() => move(index - 1)}>← 이전</button>
        <div className="dots">{problems.slice(Math.max(0, index - 2), index + 3).map((item, dotIndex) =>
          <i key={item.id} className={item.id === problem.id ? 'on' : ''}>{Math.max(0, index - 2) + dotIndex + 1}</i>
        )}</div>
        <button disabled={index === problems.length - 1} onClick={() => move(index + 1)}>다음 →</button>
      </footer>
      <p className="sr-only" id="code-editor-keyboard-help">
        Tab과 Shift+Tab으로 코드를 들여쓰거나 내어씁니다. 편집기 밖으로 이동하려면 Escape를 누른 다음
        Tab 또는 Shift+Tab을 누르세요. Ctrl 또는 Command와 Enter를 함께 누르면 코드를 검사하고,
        정답 확인 후 다시 누르면 다음 단계가 있을 때 이동합니다.
      </p>
    </main>}
  </div>
}
