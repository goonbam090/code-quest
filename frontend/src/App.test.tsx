import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'
import { api } from './lib/api'
import type { Problem, Submission } from './types'
import htmlCatalog from '../../backend/src/main/resources/problems/html.json'

vi.mock('./lib/api', () => ({
  api: {
    problems: vi.fn(),
    progress: vi.fn(),
    submit: vi.fn()
  }
}))

vi.mock('./components/CodeEditor', async () => {
  const React = await import('react')

  const CodeEditor = React.forwardRef(function MockCodeEditor(props: any, forwardedRef: any) {
    const inputRef = React.useRef<HTMLTextAreaElement>(null)
    const tabExitArmedRef = React.useRef(false)
    const {
      language,
      cssSyntaxMode,
      onChange,
      onSubmit,
      readOnly,
      value,
      ...inputProps
    } = props

    React.useImperativeHandle(forwardedRef, () => ({
      focus: (options?: FocusOptions) => inputRef.current?.focus(options),
      focusLine: (lineNumber: number) => {
        const input = inputRef.current
        if (!input) return
        const lines = String(value).split('\n')
        const safeLine = Math.min(Math.max(lineNumber, 1), lines.length)
        const start = lines.slice(0, safeLine - 1).reduce((length, line) => length + line.length + 1, 0)
        input.focus()
        input.setSelectionRange(start, start + lines[safeLine - 1].length)
      },
      scrollIntoView: (options?: ScrollIntoViewOptions) => inputRef.current?.scrollIntoView(options)
    }))

    return <textarea
      {...inputProps}
      ref={inputRef}
      data-language={language}
      data-css-syntax={cssSyntaxMode}
      readOnly={readOnly}
      value={value}
      onChange={event => onChange(event.target.value)}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          tabExitArmedRef.current = true
          return
        }
        if (event.key === 'Tab') {
          event.preventDefault()
          if (tabExitArmedRef.current) {
            const focusable = Array.from(document.querySelectorAll<HTMLElement>(
              'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary'
            ))
            const currentIndex = focusable.indexOf(event.currentTarget)
            focusable[currentIndex + (event.shiftKey ? -1 : 1)]?.focus()
            tabExitArmedRef.current = false
          }
          return
        }
        tabExitArmedRef.current = false
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          onSubmit?.()
        }
      }}
    />
  })

  return { CodeEditor }
})

const mockedApi = vi.mocked(api)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function learningMapProblem(number: number, stage = '통합 단계'): Problem {
  return {
    id: number,
    category: 'selector',
    number,
    mode: 'selector',
    stage,
    title: `학습 문제 ${number}`,
    question: `${number}번 학습 대상을 선택하세요.`,
    html: `<main><p class="target-${number}">학습 대상</p></main>`,
    starterCode: '',
    examples: [],
    constraints: [],
    hints: [
      `${number}번 핵심 개념을 적용합니다.`,
      `비슷한 코드 패턴: .sample-${number}`,
      '선택 조건과 대상의 관계를 확인합니다.'
    ],
    learning: {
      keywords: [`개념 ${number}`, `키워드 ${number}`],
      summary: `${number}번 문제에서 확인할 개념을 이해합니다.`,
      example: {
        code: `.sample-${number}`,
        explanation: `sample-${number} 클래스를 가진 요소를 선택합니다.`
      },
      principles: [
        `${number}번 개념의 첫 번째 동작 원리입니다.`,
        `${number}번 개념의 두 번째 동작 원리입니다.`
      ],
      applications: [{
        title: `${number}번 응용`,
        description: `${number}번 개념을 다른 화면에 적용합니다.`,
        code: `.example-${number} { color: inherit; }`
      }],
      pitfalls: [`${number}번 개념의 조건을 다른 조건과 혼동하지 않습니다.`]
    }
  }
}

function htmlCatalogProblems(): Problem[] {
  const learning = htmlCatalog.learning as Record<string, NonNullable<Problem['learning']>>
  return htmlCatalog.problems.map((problem, index) => ({
    ...problem,
    category: 'html',
    number: index + 1,
    mode: 'html' as const,
    examples: [],
    learning: learning[String(problem.id)]
  }))
}

describe('App accessibility', () => {
  beforeEach(() => {
    mockedApi.problems.mockReset()
    mockedApi.progress.mockReset()
    mockedApi.submit.mockReset()
    localStorage.clear()
    localStorage.setItem('codequest-learner', 'accessibility-test')
    localStorage.setItem('codequest-last-track', 'css')
    localStorage.setItem('codequest-last-category', 'selector')
    Object.defineProperty(window, 'scrollX', { configurable: true, value: 0 })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      writable: true,
      value: vi.fn()
    })
    mockedApi.problems.mockResolvedValue([{
      id: 1,
      category: 'selector',
      number: 1,
      mode: 'selector',
      stage: '선택자 기초',
      title: '문단 선택',
      question: '모든 문단을 선택하세요.',
      html: '<main><p>첫 문단</p></main>',
      starterCode: '',
      examples: [],
      constraints: [],
      hints: ['태그 선택자를 사용하세요.']
    }])
    mockedApi.progress.mockResolvedValue({
      learnerKey: 'accessibility-test',
      solved: 0,
      attempts: 0,
      solvedProblemIds: []
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true })
    })
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('starts a first-time learner in HTML document structure', async () => {
    localStorage.removeItem('codequest-last-track')
    localStorage.removeItem('codequest-last-category')
    mockedApi.problems.mockResolvedValueOnce([{
      id: 101,
      category: 'html',
      number: 1,
      mode: 'html',
      stage: '문서 구조',
      title: 'HTML 문서의 시작',
      question: '의미 있는 문서 구조를 작성하세요.',
      html: '',
      starterCode: '<main></main>',
      examples: [],
      constraints: [],
      hints: ['main 요소를 사용하세요.']
    }])

    render(<App />)

    await screen.findByRole('heading', { name: '1. HTML 문서의 시작' })
    expect(mockedApi.problems).toHaveBeenNthCalledWith(1, 'html')
    const trackNavigation = screen.getByRole('navigation', { name: '학습 트랙' })
    expect(within(trackNavigation).getByRole('button', { name: /HTML Quest/ }))
      .toHaveAttribute('aria-current', 'page')
    expect(within(screen.getByRole('navigation', { name: '학습 카테고리' }))
      .getByRole('button', { name: /문서 구조/ })).toHaveAttribute('aria-current', 'page')
  })

  it('does not attach a draft from the previous CSS catalog to a renumbered problem', async () => {
    localStorage.setItem('codequest-draft-1', '.old-catalog-answer')

    render(<App />)

    const editor = await screen.findByRole('textbox', { name: 'CSS 답안' })
    expect(editor).toHaveValue('')
    expect(editor).toHaveAttribute('data-css-syntax', 'stylesheet')

    fireEvent.change(editor, { target: { value: 'p' } })
    expect(localStorage.getItem('codequest-draft-css-155-v1-1')).toBe('p')
  })

  it('honors the home action while the initial HTML request is still loading', async () => {
    localStorage.setItem('codequest-last-track', 'html')
    localStorage.setItem('codequest-last-category', 'html-structure')
    localStorage.setItem('codequest-last-html-structure', '2')
    const initialRequest = deferred<Problem[]>()
    const htmlProblems: Problem[] = [
      {
        id: 101,
        category: 'html',
        number: 1,
        mode: 'html',
        stage: '문서 구조',
        title: 'HTML 첫 문제',
        question: '첫 문서 구조를 작성하세요.',
        html: '',
        starterCode: '<main></main>',
        examples: [],
        constraints: [],
        hints: ['main 요소를 사용하세요.']
      },
      {
        id: 102,
        category: 'html',
        number: 2,
        mode: 'html',
        stage: '문서 구조',
        title: 'HTML 두 번째 문제',
        question: '두 번째 문서 구조를 작성하세요.',
        html: '',
        starterCode: '<article></article>',
        examples: [],
        constraints: [],
        hints: ['article 요소를 사용하세요.']
      }
    ]
    mockedApi.problems
      .mockImplementationOnce(() => initialRequest.promise)
      .mockResolvedValueOnce(htmlProblems)

    render(<App />)
    expect(screen.getByText('문제를 불러오는 중…')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Code Quest 홈으로 이동' }))

    const firstProblem = await screen.findByRole('heading', { name: '1. HTML 첫 문제' })
    expect(mockedApi.problems).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(firstProblem).toHaveFocus())

    await act(async () => {
      initialRequest.resolve([{
        ...htmlProblems[1],
        title: '늦게 도착한 HTML 문제'
      }])
      await initialRequest.promise
    })
    expect(screen.getByRole('heading', { name: '1. HTML 첫 문제' })).toBeInTheDocument()
    expect(screen.queryByText('늦게 도착한 HTML 문제')).not.toBeInTheDocument()
  })

  it('retries the default HTML screen when its first request failed', async () => {
    localStorage.setItem('codequest-last-track', 'html')
    localStorage.setItem('codequest-last-category', 'html-structure')
    localStorage.setItem('codequest-last-html-structure', '2')
    mockedApi.problems
      .mockRejectedValueOnce(new Error('HTML 문제를 불러오지 못했습니다.'))
      .mockResolvedValueOnce([
        {
          id: 101,
          category: 'html',
          number: 1,
          mode: 'html',
          stage: '문서 구조',
          title: 'HTML 첫 문제',
          question: '첫 문서 구조를 작성하세요.',
          html: '',
          starterCode: '<main></main>',
          examples: [],
          constraints: [],
          hints: ['main 요소를 사용하세요.']
        },
        {
          id: 102,
          category: 'html',
          number: 2,
          mode: 'html',
          stage: '문서 구조',
          title: 'HTML 두 번째 문제',
          question: '두 번째 문서 구조를 작성하세요.',
          html: '',
          starterCode: '<article></article>',
          examples: [],
          constraints: [],
          hints: ['article 요소를 사용하세요.']
        }
      ])

    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('HTML 문제를 불러오지 못했습니다.')
    fireEvent.click(screen.getByRole('button', { name: 'Code Quest 홈으로 이동' }))

    const firstProblem = await screen.findByRole('heading', { name: '1. HTML 첫 문제' })
    expect(mockedApi.problems).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(firstProblem).toHaveFocus())
  })

  it('returns to the first HTML problem when the Code Quest home button is selected', async () => {
    localStorage.setItem('codequest-last-html-structure', '2')
    render(<App />)
    await screen.findByRole('heading', { name: '1. 문단 선택' })
    mockedApi.problems.mockResolvedValueOnce([
      {
        id: 101,
        category: 'html',
        number: 1,
        mode: 'html',
        stage: '문서 구조',
        title: 'HTML 첫 문제',
        question: '첫 문서 구조를 작성하세요.',
        html: '',
        starterCode: '<main></main>',
        examples: [],
        constraints: [],
        hints: ['main 요소를 사용하세요.']
      },
      {
        id: 102,
        category: 'html',
        number: 2,
        mode: 'html',
        stage: '문서 구조',
        title: 'HTML 두 번째 문제',
        question: '두 번째 문서 구조를 작성하세요.',
        html: '',
        starterCode: '<article></article>',
        examples: [],
        constraints: [],
        hints: ['article 요소를 사용하세요.']
      }
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Code Quest 홈으로 이동' }))

    const firstProblem = await screen.findByRole('heading', { name: '1. HTML 첫 문제' })
    await vi.waitFor(() => expect(firstProblem).toHaveFocus())
    expect(mockedApi.problems).toHaveBeenLastCalledWith('html')
    expect(localStorage.getItem('codequest-last-track')).toBe('html')
    expect(localStorage.getItem('codequest-last-category')).toBe('html-structure')
    expect(localStorage.getItem('codequest-last-html-structure')).toBe('2')
    expect(within(screen.getByRole('navigation', { name: '학습 트랙' }))
      .getByRole('button', { name: /HTML Quest/ })).toHaveAttribute('aria-current', 'page')
  })

  it('gives the problem navigator search field a descriptive name', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '1. 문단 선택' })

    fireEvent.click(screen.getByRole('button', { name: /전체 문제 보기/ }))

    const search = screen.getByRole('searchbox', { name: '문제 검색' })
    await vi.waitFor(() => expect(search).toHaveFocus())
    fireEvent.change(search, { target: { value: '문단' } })
    fireEvent.click(screen.getByRole('button', { name: '검색어 지우기' }))
    await vi.waitFor(() => expect(search).toHaveFocus())
    expect(search).toHaveValue('')
  })

  it('returns keyboard focus to the navigator toggle after Escape closes it', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '1. 문단 선택' })
    const toggle = screen.getByRole('button', { name: /전체 문제 보기/ })

    fireEvent.click(toggle)
    const search = screen.getByRole('searchbox', { name: '문제 검색' })
    await vi.waitFor(() => expect(search).toHaveFocus())

    fireEvent.keyDown(window, { key: 'Escape' })
    await vi.waitFor(() => expect(toggle).toHaveFocus())
    expect(screen.queryByRole('searchbox', { name: '문제 검색' })).not.toBeInTheDocument()
  })

  it('connects five-problem learning units to one continuous concept curriculum', async () => {
    mockedApi.problems.mockResolvedValueOnce([
      {
        id: 1,
        category: 'selector',
        number: 1,
        mode: 'selector',
        stage: '선택자 기초',
        title: '문단 선택',
        question: '모든 문단을 선택하세요.',
        html: '<main><p>첫 문단</p></main>',
        starterCode: '',
        examples: [],
        constraints: [],
        hints: [
          '태그 이름으로 같은 종류의 요소를 한 번에 선택할 수 있습니다.',
          '태그 선택자는 같은 HTML 태그를 모두 선택합니다. 예: article, button',
          '태그 이름을 그대로 작성합니다.'
        ],
        learning: {
          keywords: ['태그 선택자', '요소 이름'],
          summary: '태그 이름으로 같은 종류의 요소를 한 번에 선택할 수 있습니다.',
          example: {
            code: 'article, button',
            explanation: '쉼표로 나열한 article과 button 요소를 각각 선택합니다.'
          },
          principles: [
            '태그 이름을 점이나 # 없이 그대로 작성합니다.',
            '이름이 같은 요소가 여러 개면 모두 선택됩니다.'
          ],
          applications: [{
            title: '문서 기본 요소 스타일',
            description: '같은 종류의 문서 영역에 공통 여백을 적용합니다.',
            code: 'section { padding: 1rem; }'
          }],
          pitfalls: ['범위를 제한하지 않으면 같은 태그가 모두 선택됩니다.']
        }
      },
      {
        id: 2,
        category: 'selector',
        number: 2,
        mode: 'selector',
        stage: '관계 선택자',
        title: '제목 선택',
        question: '제목을 선택하세요.',
        html: '<main><h2>제목</h2></main>',
        starterCode: '',
        examples: [],
        constraints: [],
        hints: [
          '제목 태그를 사용하세요.',
          '비슷한 코드 패턴: section > h3',
          '공백은 모든 후손을, >는 직계 자식을 찾습니다.'
        ],
        learning: {
          keywords: ['자식 결합자', '>'],
          summary: '부모 바로 아래에 있는 직계 자식만 선택합니다.',
          example: {
            code: 'section > h3',
            explanation: 'section 바로 아래의 h3만 선택합니다.'
          },
          principles: [
            '> 왼쪽은 부모이고 오른쪽은 직계 자식입니다.',
            '더 깊이 중첩된 h3는 선택하지 않습니다.'
          ],
          applications: [{
            title: '중첩 영역 영향 차단',
            description: '현재 section의 직접 제목만 꾸밉니다.',
            code: '.panel > h3 { margin-top: 0; }'
          }],
          pitfalls: ['중간 래퍼가 생기면 직계 자식 조건에 일치하지 않습니다.']
        }
      }
    ])
    mockedApi.progress.mockResolvedValueOnce({
      learnerKey: 'accessibility-test',
      solved: 1,
      attempts: 1,
      solvedProblemIds: [1]
    })
    render(<App />)
    await screen.findByRole('heading', { name: '1. 문단 선택' })
    await vi.waitFor(() => expect(screen.getByText('현재 영역 완료 · 전체 1문제')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /전체 문제 보기/ }))
    fireEvent.click(screen.getByRole('button', { name: '학습 지도 열기' }))

    const mapHeading = await screen.findByRole('heading', { name: '선택자 학습 지도' })
    await vi.waitFor(() => expect(mapHeading).toHaveFocus())
    const unitNavigation = screen.getByRole('navigation', { name: '5문제 단위 학습 지도' })
    expect(within(unitNavigation).getAllByRole('link')).toHaveLength(2)
    expect(unitNavigation).toHaveTextContent('Quest 01–01')
    expect(unitNavigation).toHaveTextContent('Quest 02–02')

    const conceptMap = screen.getByRole('region', { name: '5문제 단위 실습 안내' })
    expect(within(conceptMap).getByRole('heading', {
      name: '선택자 기초 · Quest 01–01'
    })).toBeInTheDocument()
    expect(within(conceptMap).getByRole('heading', {
      name: '관계 선택자 · Quest 02–02'
    })).toBeInTheDocument()
    expect(within(conceptMap).getByRole('heading', { name: '문단 선택' })).toBeInTheDocument()
    expect(within(conceptMap).getByRole('heading', { name: '제목 선택' })).toBeInTheDocument()
    expect(within(conceptMap).getByText(
      '태그 이름으로 같은 종류의 요소를 한 번에 선택할 수 있습니다.'
    )).toBeInTheDocument()
    expect(within(conceptMap).getByText('부모 바로 아래에 있는 직계 자식만 선택합니다.'))
      .toBeInTheDocument()
    expect(within(conceptMap).getAllByText(/유사 사용 예시/)).toHaveLength(2)
    const completedCard = screen.getByRole('button', { name: '1번 문단 선택 다시 풀기' })
      .closest('article')
    const upcomingCard = screen.getByRole('button', { name: '2번 제목 선택 학습 시작하기' })
      .closest('article')
    expect(completedCard).toHaveTextContent('복습')
    expect(completedCard).toHaveTextContent('완료한 Quest 01')
    expect(completedCard).toHaveTextContent('태그 선택자')
    expect(completedCard).toHaveTextContent('article, button')
    expect(upcomingCard).toHaveTextContent('예습')
    expect(upcomingCard).toHaveTextContent('학습할 Quest 02')
    expect(upcomingCard).toHaveTextContent('자식 결합자')
    expect(upcomingCard).toHaveTextContent('section > h3')

    const handbook = screen.getByRole('region', { name: '선택자 학습 교안' })
    expect(handbook).toHaveTextContent('문제별 정답을 나열하지 않습니다.')
    expect(handbook).toHaveTextContent('개념 이해')
    expect(handbook).toHaveTextContent('예시 해석')
    expect(handbook).toHaveTextContent('Quest 실전')
    expect(handbook).toHaveTextContent('문서 기본 요소 스타일')
    expect(handbook).toHaveTextContent('범위를 제한하지 않으면 같은 태그가 모두 선택됩니다.')
    expect(within(handbook).getAllByText('왜 필요한가와 동작 원리')).toHaveLength(2)
    expect(within(handbook).getAllByText('예시를 코드 순서로 읽기')).toHaveLength(2)
    expect(within(handbook).getAllByText('실제 화면과 코드에 응용하기')).toHaveLength(2)
    expect(within(handbook).getAllByText('자주 하는 실수')).toHaveLength(2)
    expect(handbook.querySelectorAll('details, summary')).toHaveLength(0)
    const curriculumFlows = within(handbook).getAllByRole('list', { name: /개념 학습 순서/ })
    expect(curriculumFlows).toHaveLength(2)
    expect(curriculumFlows.flatMap(flow => Array.from(flow.children))).toHaveLength(2)
    expect(within(handbook).getByRole('heading', {
      name: '태그 선택자 · 문단 선택'
    })).toBeInTheDocument()
    const secondConceptHeading = within(handbook).getByRole('heading', {
      name: '자식 결합자 · 제목 선택'
    })

    fireEvent.click(within(handbook).getByRole('link', { name: /자식 결합자/ }))
    await vi.waitFor(() => expect(secondConceptHeading).toHaveFocus())
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'start'
    })
    expect(secondConceptHeading.closest('.review-curriculum-topic'))
      .toHaveTextContent('중간 래퍼가 생기면')

    fireEvent.click(within(handbook).getByRole('button', {
      name: 'Quest 2 제목 선택 실습하기'
    }))
    const practiceHeading = await screen.findByRole('heading', { name: '2. 제목 선택' })
    await vi.waitFor(() => expect(practiceHeading).toHaveFocus())
  })

  it('renders six problems in ordered five-plus-one units and keeps every Quest link aligned', async () => {
    mockedApi.problems.mockResolvedValueOnce(
      Array.from({ length: 6 }, (_, index) => learningMapProblem(index + 1))
    )

    render(<App />)
    await screen.findByRole('heading', { name: '1. 학습 문제 1' })
    fireEvent.click(screen.getByRole('button', { name: /전체 문제 보기/ }))
    fireEvent.click(screen.getByRole('button', { name: '학습 지도 열기' }))

    const unitNavigation = await screen.findByRole('navigation', { name: '5문제 단위 학습 지도' })
    const unitLinks = within(unitNavigation).getAllByRole('link')
    expect(unitLinks).toHaveLength(2)
    expect(unitNavigation).toHaveTextContent('Quest 01–05')
    expect(unitNavigation).toHaveTextContent('Quest 06–06')

    const firstUnitHeading = screen.getByRole('heading', {
      name: '통합 단계 · Quest 01–05'
    })
    fireEvent.click(unitLinks[0])
    await vi.waitFor(() => expect(firstUnitHeading).toHaveFocus())
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'start'
    })

    const firstUnit = screen.getByRole('region', { name: '통합 단계 · Quest 01–05' })
    const secondUnit = screen.getByRole('region', { name: '통합 단계 · Quest 06–06' })
    expect(firstUnit.querySelectorAll(':scope .review-card')).toHaveLength(5)
    expect(secondUnit.querySelectorAll(':scope .review-card')).toHaveLength(1)

    const handbook = screen.getByRole('region', { name: '선택자 학습 교안' })
    const flow = within(handbook).getByRole('list', { name: '통합 단계 개념 학습 순서' })
    const topics = Array.from(flow.children)
    expect(topics).toHaveLength(6)
    expect(topics.map(topic =>
      within(topic as HTMLElement).getByRole('heading', { level: 5 }).textContent
    )).toEqual([
      '개념 1 · 학습 문제 1',
      '개념 2 · 학습 문제 2',
      '개념 3 · 학습 문제 3',
      '개념 4 · 학습 문제 4',
      '개념 5 · 학습 문제 5',
      '개념 6 · 학습 문제 6'
    ])
    expect(topics.map(topic =>
      within(topic as HTMLElement).getByRole('button').getAttribute('aria-label')
    )).toEqual([
      'Quest 1 학습 문제 1 실습하기',
      'Quest 2 학습 문제 2 실습하기',
      'Quest 3 학습 문제 3 실습하기',
      'Quest 4 학습 문제 4 실습하기',
      'Quest 5 학습 문제 5 실습하기',
      'Quest 6 학습 문제 6 실습하기'
    ])

    fireEvent.click(within(topics[5] as HTMLElement).getByRole('button'))
    const sixthProblem = await screen.findByRole('heading', { name: '6. 학습 문제 6' })
    await vi.waitFor(() => expect(sixthProblem).toHaveFocus())
  })

  it('renders the real HTML document-structure category as one complete five-problem curriculum', async () => {
    localStorage.setItem('codequest-last-track', 'html')
    localStorage.setItem('codequest-last-category', 'html-structure')
    const catalogProblems = htmlCatalogProblems()
    const documentStructureProblems = catalogProblems.filter(problem => problem.stage === '문서 구조')
    mockedApi.problems.mockResolvedValueOnce(catalogProblems)

    render(<App />)
    await screen.findByRole('heading', { name: '1. 페이지의 주 콘텐츠' })
    fireEvent.click(screen.getByRole('button', { name: /전체 문제 보기/ }))
    fireEvent.click(screen.getByRole('button', { name: '학습 지도 열기' }))

    const unitList = await screen.findByRole('region', { name: '5문제 단위 실습 안내' })
    const units = unitList.querySelectorAll('.review-problem-unit')
    expect(units).toHaveLength(1)
    expect(Array.from(units, unit =>
      unit.querySelectorAll('.review-card').length
    )).toEqual([5])

    const handbook = screen.getByRole('region', { name: '문서 구조 학습 교안' })
    const topics = handbook.querySelectorAll('.review-curriculum-topic')
    expect(topics).toHaveLength(documentStructureProblems.length)

    documentStructureProblems.forEach((problem, index) => {
      const learning = problem.learning!
      const topic = topics[index] as HTMLElement
      expect(within(topic).getByRole('heading', {
        level: 5,
        name: problem.title
      })).toBeInTheDocument()
      expect(topic).toHaveTextContent(learning.summary)
      learning.principles.forEach(principle => expect(topic).toHaveTextContent(principle))
      expect(topic).toHaveTextContent(learning.example.explanation)
      learning.applications.forEach(application => {
        expect(topic).toHaveTextContent(application.title)
        expect(topic).toHaveTextContent(application.description)
      })
      learning.pitfalls.forEach(pitfall => expect(topic).toHaveTextContent(pitfall))
    })
  })

  it('keeps non-contiguous repeated stages as distinct curriculum chapters without duplicate keys', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockedApi.problems.mockResolvedValueOnce([
      learningMapProblem(1, '반복 단계'),
      learningMapProblem(2, '중간 단계'),
      learningMapProblem(3, '반복 단계')
    ])

    render(<App />)
    await screen.findByRole('heading', { name: '1. 학습 문제 1' })
    fireEvent.click(screen.getByRole('button', { name: /전체 문제 보기/ }))
    const stageFilters = screen.getByRole('navigation', { name: '학습 단계 필터' })
    expect(within(stageFilters).getAllByRole('button', { name: /반복 단계/ })).toHaveLength(1)
    expect(within(stageFilters).getByRole('button', { name: /반복 단계/ }))
      .toHaveTextContent('1–3 · 2개')
    fireEvent.click(screen.getByRole('button', { name: '학습 지도 열기' }))

    const handbook = await screen.findByRole('region', { name: '선택자 학습 교안' })
    const chapters = handbook.querySelectorAll('.review-curriculum-chapter')
    expect(chapters).toHaveLength(3)
    expect(Array.from(chapters, chapter =>
      within(chapter as HTMLElement).getByRole('heading', { level: 4 }).textContent
    )).toEqual(['반복 단계', '중간 단계', '반복 단계'])
    expect(new Set(Array.from(chapters, chapter =>
      chapter.querySelector('h4')?.getAttribute('id')
    )).size)
      .toBe(chapters.length)

    const duplicateKeyWarnings = consoleError.mock.calls.filter(call =>
      call.some(value => String(value).includes('same key'))
    )
    expect(duplicateKeyWarnings).toEqual([])
  })

  it('shows a natural-language usage context instead of an empty handbook example', async () => {
    localStorage.setItem('codequest-last-track', 'algorithm')
    localStorage.setItem('codequest-last-category', 'algorithm-intermediate')
    mockedApi.problems.mockResolvedValueOnce([{
      id: 3,
      category: 'algorithm-intermediate',
      number: 3,
      mode: 'algorithm',
      stage: '완전 탐색',
      title: 'N-Queens 배치 수',
      question: '서로 공격하지 않는 퀸 배치 수를 구하세요.',
      html: '',
      starterCode: 'public class Solution {}',
      examples: [],
      constraints: [],
      hints: [
        '행을 하나씩 내려가며 사용할 열을 선택하세요.',
        '비슷한 예시: 사용한 열과 두 대각선을 boolean[]로 표시하고 재귀 후 원상복구합니다.',
        '대각선은 row-column과 row+column 값으로 확인합니다.'
      ]
    }])

    render(<App />)
    await screen.findByRole('heading', { name: '1. N-Queens 배치 수' })
    fireEvent.click(screen.getByRole('button', { name: /전체 문제 보기/ }))
    fireEvent.click(screen.getByRole('button', { name: '학습 지도 열기' }))

    const handbook = await screen.findByRole('region', { name: '코딩테스트 중급 학습 교안' })
    expect(within(handbook).getByRole('heading', { name: '사용 맥락 이해하기' })).toBeInTheDocument()
    expect(handbook.querySelector('.review-lesson-context')).toHaveTextContent(
      '사용한 열과 두 대각선을 boolean[]로 표시하고 재귀 후 원상복구합니다.'
    )
    expect(handbook.querySelector('.review-lesson-context')?.closest('div')?.querySelector('dl'))
      .not.toBeInTheDocument()
  })

  it('lets keyboard users escape an indentation-enabled editor', async () => {
    mockedApi.problems.mockResolvedValueOnce([{
      id: 2,
      category: 'html',
      number: 1,
      mode: 'html',
      stage: '문서 구조',
      title: '문서 작성',
      question: '문서를 작성하세요.',
      html: '',
      starterCode: '<main></main>',
      examples: [],
      constraints: [],
      hints: ['시맨틱 요소를 사용하세요.']
    }])
    render(<App />)
    const editor = await screen.findByRole('textbox', { name: 'HTML 답안' })

    expect(fireEvent.keyDown(editor, { key: 'Tab' })).toBe(false)
    expect(fireEvent.keyDown(editor, { key: 'Escape' })).toBe(true)
    expect(fireEvent.keyDown(editor, { key: 'Tab' })).toBe(false)
    await vi.waitFor(() => expect(screen.getByRole('button', { name: '힌트' })).toHaveFocus())
    expect(editor).toHaveAccessibleDescription(/Escape를 누른 다음 Tab/)
    expect(editor).toHaveAccessibleDescription(/Alt 또는 Option과 Shift, F/)
    expect(editor).toHaveAccessibleDescription(/정답 확인 후 다시 누르면 다음 단계/)
  })

  it('uses Mod+Enter to grade, move next, and keep the answer editor and viewport active', async () => {
    mockedApi.problems.mockResolvedValueOnce([
      {
        id: 1,
        category: 'selector',
        number: 1,
        mode: 'selector',
        stage: '선택자 기초',
        title: '문단 선택',
        question: '모든 문단을 선택하세요.',
        html: '<main><p>첫 문단</p></main>',
        starterCode: '',
        examples: [],
        constraints: [],
        hints: ['태그 선택자를 사용하세요.']
      },
      {
        id: 2,
        category: 'selector',
        number: 2,
        mode: 'selector',
        stage: '선택자 기초',
        title: '제목 선택',
        question: '제목을 선택하세요.',
        html: '<main><h2>제목</h2></main>',
        starterCode: '',
        examples: [],
        constraints: [],
        hints: ['태그 이름을 확인하세요.']
      }
    ])
    mockedApi.submit.mockResolvedValueOnce({
      correct: true,
      firstSolve: true,
      status: 'CORRECT',
      diagnosticCode: 'NONE',
      message: '정답입니다.',
      intentExplanation: '문단을 정확히 선택했습니다.',
      guidance: ''
    })
    render(<App />)
    await screen.findByRole('heading', { name: '1. 문단 선택' })

    const editor = screen.getByRole('textbox', { name: 'CSS 답안' })
    fireEvent.change(editor, { target: { value: 'p' } })
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

    const nextAction = await screen.findByRole('button', { name: /다음 문제 바로 풀기/ })
    expect(nextAction).toHaveTextContent('Ctrl/⌘↵')
    expect(mockedApi.submit).toHaveBeenCalledTimes(1)
    const editorFocus = vi.spyOn(editor, 'focus')
    Object.defineProperty(window, 'scrollX', { configurable: true, value: 24 })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 })
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)

    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true })

    await screen.findByRole('heading', { name: '2. 제목 선택' })
    await vi.waitFor(() => expect(editor).toHaveFocus())
    expect(editorFocus).toHaveBeenCalledWith({ preventScroll: true })
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'auto', left: 24, top: 640 })
    expect(mockedApi.submit).toHaveBeenCalledTimes(1)
  })

  it('uses Command+Enter after focus moves from the editor to another practice control', async () => {
    mockedApi.submit.mockResolvedValueOnce({
      correct: false,
      firstSolve: false,
      status: 'INCORRECT',
      diagnosticCode: 'SELECTOR_MISMATCH',
      message: '선택 결과가 달라요.',
      intentExplanation: '문단을 선택합니다.',
      guidance: '선택자를 다시 확인하세요.'
    })
    render(<App />)
    await screen.findByRole('heading', { name: '1. 문단 선택' })
    const hintButton = screen.getByRole('button', { name: '힌트' })
    hintButton.focus()

    fireEvent.keyDown(hintButton, { key: 'Enter', metaKey: true })

    await vi.waitFor(() => expect(mockedApi.submit).toHaveBeenCalledTimes(1))
    expect(mockedApi.submit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      'accessibility-test',
      ''
    )
  })

  it('uses Mod+Enter to retry instead of advancing after an incorrect result', async () => {
    mockedApi.problems.mockResolvedValueOnce([
      {
        id: 1,
        category: 'selector',
        number: 1,
        mode: 'selector',
        stage: '선택자 기초',
        title: '문단 선택',
        question: '모든 문단을 선택하세요.',
        html: '<main><p>첫 문단</p></main>',
        starterCode: '',
        examples: [],
        constraints: [],
        hints: ['태그 선택자를 사용하세요.']
      },
      {
        id: 2,
        category: 'selector',
        number: 2,
        mode: 'selector',
        stage: '선택자 기초',
        title: '제목 선택',
        question: '제목을 선택하세요.',
        html: '<main><h2>제목</h2></main>',
        starterCode: '',
        examples: [],
        constraints: [],
        hints: ['제목 태그를 사용하세요.']
      }
    ])
    mockedApi.submit.mockResolvedValue({
      correct: false,
      firstSolve: false,
      status: 'INCORRECT',
      diagnosticCode: 'SELECTOR_MISMATCH',
      message: '선택한 요소가 달라요.',
      intentExplanation: '문단을 선택해야 합니다.',
      guidance: '태그 이름을 다시 확인하세요.'
    })
    render(<App />)
    const editor = await screen.findByRole('textbox', { name: 'CSS 답안' })

    fireEvent.change(editor, { target: { value: 'div' } })
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    await screen.findByText('선택한 요소가 달라요.')

    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    await vi.waitFor(() => expect(mockedApi.submit).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('heading', { name: '1. 문단 선택' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /다음 문제 바로 풀기/ })).not.toBeInTheDocument()
  })

  it('grades the edited answer again instead of advancing from a stale correct result', async () => {
    mockedApi.problems.mockResolvedValueOnce([
      {
        id: 1,
        category: 'selector',
        number: 1,
        mode: 'selector',
        stage: '선택자 기초',
        title: '문단 선택',
        question: '모든 문단을 선택하세요.',
        html: '<main><p>첫 문단</p></main>',
        starterCode: '',
        examples: [],
        constraints: [],
        hints: ['태그 선택자를 사용하세요.']
      },
      {
        id: 2,
        category: 'selector',
        number: 2,
        mode: 'selector',
        stage: '선택자 기초',
        title: '제목 선택',
        question: '제목을 선택하세요.',
        html: '<main><h2>제목</h2></main>',
        starterCode: '',
        examples: [],
        constraints: [],
        hints: ['제목 태그를 사용하세요.']
      }
    ])
    mockedApi.submit.mockResolvedValue({
      correct: true,
      firstSolve: true,
      status: 'CORRECT',
      diagnosticCode: 'NONE',
      message: '정답입니다.',
      intentExplanation: '문단을 정확히 선택했습니다.',
      guidance: ''
    })
    render(<App />)
    const editor = await screen.findByRole('textbox', { name: 'CSS 답안' })

    fireEvent.change(editor, { target: { value: 'p' } })
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    await screen.findByRole('button', { name: /다음 문제 바로 풀기/ })

    fireEvent.change(editor, { target: { value: 'p, span' } })
    expect(screen.queryByRole('button', { name: /다음 문제 바로 풀기/ })).not.toBeInTheDocument()
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

    await vi.waitFor(() => expect(mockedApi.submit).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('heading', { name: '1. 문단 선택' })).toBeInTheDocument()
  })

  it('ignores repeated Mod+Enter while the current submission is still running', async () => {
    const submissionRequest = deferred<Submission>()
    mockedApi.submit.mockImplementationOnce(() => submissionRequest.promise)
    render(<App />)
    const editor = await screen.findByRole('textbox', { name: 'CSS 답안' })

    fireEvent.change(editor, { target: { value: 'p' } })
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

    expect(mockedApi.submit).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /채점 중/ })).toBeDisabled()

    await act(async () => {
      submissionRequest.resolve({
        correct: true,
        firstSolve: true,
        status: 'CORRECT',
        diagnosticCode: 'NONE',
        message: '정답입니다.',
        intentExplanation: '문단을 정확히 선택했습니다.',
        guidance: ''
      })
      await submissionRequest.promise
    })

    expect(await screen.findByRole('button', { name: /CSS 속성으로 계속하기/ })).toBeInTheDocument()
    expect(mockedApi.submit).toHaveBeenCalledTimes(1)
  })

  it('does not advance when a button-triggered regrade is still running', async () => {
    mockedApi.problems.mockResolvedValueOnce([
      {
        id: 1,
        category: 'selector',
        number: 1,
        mode: 'selector',
        stage: '선택자 기초',
        title: '문단 선택',
        question: '모든 문단을 선택하세요.',
        html: '<main><p>첫 문단</p></main>',
        starterCode: '',
        examples: [],
        constraints: [],
        hints: ['태그 선택자를 사용하세요.']
      },
      {
        id: 2,
        category: 'selector',
        number: 2,
        mode: 'selector',
        stage: '선택자 기초',
        title: '제목 선택',
        question: '제목을 선택하세요.',
        html: '<main><h2>제목</h2></main>',
        starterCode: '',
        examples: [],
        constraints: [],
        hints: ['제목 태그를 사용하세요.']
      }
    ])
    mockedApi.submit.mockResolvedValueOnce({
      correct: true,
      firstSolve: true,
      status: 'CORRECT',
      diagnosticCode: 'NONE',
      message: '정답입니다.',
      intentExplanation: '문단을 정확히 선택했습니다.',
      guidance: ''
    })
    const regradeRequest = deferred<Submission>()
    mockedApi.submit.mockImplementationOnce(() => regradeRequest.promise)
    render(<App />)
    const editor = await screen.findByRole('textbox', { name: 'CSS 답안' })

    fireEvent.change(editor, { target: { value: 'p' } })
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    await screen.findByRole('button', { name: /다음 문제 바로 풀기/ })

    fireEvent.click(screen.getByRole('button', { name: /정답 확인/ }))
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

    expect(mockedApi.submit).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('heading', { name: '1. 문단 선택' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /채점 중/ })).toBeDisabled()

    await act(async () => {
      regradeRequest.resolve({
        correct: true,
        firstSolve: false,
        status: 'CORRECT',
        diagnosticCode: 'NONE',
        message: '다시 확인한 정답입니다.',
        intentExplanation: '문단을 정확히 선택했습니다.',
        guidance: ''
      })
      await regradeRequest.promise
    })

    expect(await screen.findByText('다시 확인한 정답입니다.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1. 문단 선택' })).toBeInTheDocument()
  })

  it('does not resubmit or leave the final problem when no next step exists', async () => {
    localStorage.setItem('codequest-last-track', 'algorithm')
    localStorage.setItem('codequest-last-category', 'algorithm-intermediate')
    mockedApi.problems.mockResolvedValueOnce([{
      id: 599,
      category: 'algorithm-intermediate',
      number: 1,
      mode: 'algorithm',
      stage: 'Tree·Heap 및 그래프 응용',
      title: '마지막 문제',
      question: '마지막 결과를 반환하세요.',
      html: '',
      starterCode: 'public class Solution {}',
      examples: [],
      constraints: [],
      hints: ['return을 확인하세요.']
    }])
    mockedApi.submit.mockResolvedValueOnce({
      correct: true,
      firstSolve: true,
      status: 'CORRECT',
      diagnosticCode: 'NONE',
      message: '정답입니다.',
      intentExplanation: '마지막 문제를 해결했습니다.',
      guidance: ''
    })
    render(<App />)
    const editor = await screen.findByRole('textbox', { name: 'Java 답안' })

    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    await screen.findByText('마지막 문제를 해결했습니다.')
    expect(screen.queryByRole('button', { name: /계속하기|다음 문제/ })).not.toBeInTheDocument()

    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    expect(mockedApi.submit).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: '1. 마지막 문제' })).toBeInTheDocument()
  })

  it('shows a retryable CSS judge error without exposing solved actions', async () => {
    mockedApi.problems.mockResolvedValueOnce([{
      id: 3,
      category: 'property',
      number: 1,
      mode: 'declaration',
      stage: '레이아웃 기초',
      title: 'Flex 시작',
      question: 'Flex 레이아웃을 만드세요.',
      html: '<div data-preview>대상</div>',
      starterCode: '',
      examples: [],
      constraints: [],
      hints: ['display 속성을 확인하세요.']
    }])
    mockedApi.submit.mockResolvedValueOnce({
      correct: false,
      firstSolve: false,
      status: 'ERROR',
      diagnosticCode: 'JUDGE_UNAVAILABLE',
      message: '채점 서비스를 잠시 사용할 수 없어요.',
      intentExplanation: '출제 의도: Flex 레이아웃을 만드세요.',
      guidance: '제출 내용은 시도 횟수에 반영하지 않았습니다. 잠시 후 다시 실행해 주세요.'
    })
    render(<App />)
    await screen.findByRole('heading', { name: '1. Flex 시작' })
    const editor = screen.getByRole('textbox', { name: 'CSS 답안' })
    expect(editor).toHaveAttribute('data-css-syntax', 'declarations')

    fireEvent.change(editor, { target: { value: 'display: flex;' } })
    fireEvent.click(screen.getByRole('button', { name: /정답 확인/ }))

    const result = await screen.findByRole('status')
    expect(result).toHaveTextContent('채점 서비스를 잠시 사용할 수 없어요.')
    expect(result).toHaveTextContent('채점기 연결 오류')
    expect(result).toHaveTextContent('시도 횟수에 반영하지 않았습니다')
    expect(screen.queryByRole('button', { name: /다음 문제/ })).not.toBeInTheDocument()
    expect(screen.queryByText('SOLUTION REVIEW')).not.toBeInTheDocument()
    expect(editor).toHaveValue('display: flex;')
  })

  it('opens JavaScript as a first-class code track with language-specific labels', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '1. 문단 선택' })
    mockedApi.problems.mockResolvedValueOnce([{
      id: 404,
      category: 'javascript',
      number: 1,
      mode: 'javascript',
      stage: '변수·연산',
      title: '주문 합계',
      question: '수량과 단가를 곱해 반환하세요.',
      html: '',
      starterCode: 'function solve(quantity, price) {\n    // 코드를 작성하세요.\n}',
      examples: [{
        input: 'quantity = 3, price = 1200',
        output: '3600',
        trace: []
      }],
      constraints: ['두 값은 0 이상의 정수입니다.'],
      hints: ['다른 값의 예시: const area = width * height;', '곱셈 연산자를 확인하세요.', '결과를 반환하세요.']
    }])

    fireEvent.click(screen.getByRole('button', { name: /JavaScript Quest/ }))

    await screen.findByRole('heading', { name: '1. 주문 합계' })
    expect(screen.getByLabelText('JavaScript 시작 코드')).toBeInTheDocument()
    expect(screen.getByLabelText('JavaScript 문법 사용 예시')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'JavaScript 답안' })).toHaveValue(
      'function solve(quantity, price) {\n    // 코드를 작성하세요.\n}'
    )
    expect(screen.getByText('JAVASCRIPT EDITOR')).toBeInTheDocument()
    expect(screen.getByText('RUN & TEST')).toBeInTheDocument()
  })

  it('shows the five learning tracks in the intended curriculum order', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '1. 문단 선택' })

    const trackNavigation = screen.getByRole('navigation', { name: '학습 트랙' })
    const trackButtons = within(trackNavigation).getAllByRole('button')

    expect(trackButtons).toHaveLength(5)
    expect(trackButtons.map(button => button.querySelector('strong')?.textContent)).toEqual([
      'HTML Quest',
      'CSS Quest',
      'JavaScript Quest',
      'Java Quest',
      'Algorithm Quest'
    ])
    expect(trackButtons.map(button => button.querySelector('small')?.textContent)).toEqual([
      '문서 구조와 접근성',
      '화면 구성과 레이아웃',
      '동작과 프로그래밍 기초',
      'Java 기초 → Bridge → Applied',
      'Java를 활용한 문제 해결'
    ])
    expect(within(trackNavigation).queryByText('Java Bridge')).not.toBeInTheDocument()
    expect(within(trackNavigation).queryByText('Java Applied')).not.toBeInTheDocument()
  })

  it('keeps Java foundation, Bridge, and Applied as internal Java Quest stages', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '1. 문단 선택' })
    mockedApi.problems.mockResolvedValueOnce([{
      id: 301,
      category: 'java',
      number: 1,
      mode: 'java',
      stage: '변수·연산자',
      title: '정수 합계',
      question: '두 정수의 합을 반환하세요.',
      html: '',
      starterCode: 'public class Solution {}',
      examples: [],
      constraints: [],
      hints: ['덧셈 연산자를 사용하세요.']
    }])

    const trackNavigation = screen.getByRole('navigation', { name: '학습 트랙' })
    fireEvent.click(within(trackNavigation).getByRole('button', { name: /Java Quest/ }))

    await screen.findByRole('heading', { name: '1. 정수 합계' })
    expect(mockedApi.problems).toHaveBeenLastCalledWith('java')
    const stageNavigation = screen.getByRole('navigation', { name: 'Java Quest 학습 단계' })
    const stageButtons = within(stageNavigation).getAllByRole('button')
    expect(stageButtons.map(button => button.querySelector('strong')?.textContent)).toEqual([
      'Java 기초',
      'Java Bridge',
      'Java Applied'
    ])
    expect(within(stageNavigation).getByRole('button', { name: /Java 기초/ })).toHaveAttribute('aria-current', 'step')
    expect(within(screen.getByRole('navigation', { name: '학습 카테고리' })).getAllByRole('button'))
      .toHaveLength(4)

    mockedApi.problems.mockResolvedValueOnce([{
      id: 302,
      category: 'java-bridge',
      number: 1,
      mode: 'java',
      stage: '타입·메서드 연결',
      title: '메서드 연결',
      question: '값을 메서드로 전달하세요.',
      html: '',
      starterCode: 'public class Solution {}',
      examples: [],
      constraints: [],
      hints: ['매개변수를 확인하세요.']
    }])
    fireEvent.click(within(stageNavigation).getByRole('button', { name: /Java Bridge/ }))

    await screen.findByRole('heading', { name: '1. 메서드 연결' })
    expect(mockedApi.problems).toHaveBeenLastCalledWith('java-bridge')
    expect(screen.getByText('Java Quest / Java Bridge / 타입·메서드 / 타입·메서드 연결')).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: '학습 카테고리' })).getAllByRole('button'))
      .toHaveLength(3)

    mockedApi.problems.mockResolvedValueOnce([{
      id: 303,
      category: 'java-advanced',
      number: 1,
      mode: 'java',
      stage: '객체지향 설계',
      title: '객체 역할',
      question: '객체의 역할을 분리하세요.',
      html: '',
      starterCode: 'public class Solution {}',
      examples: [],
      constraints: [],
      hints: ['책임을 나눠 보세요.']
    }])
    const updatedStageNavigation = screen.getByRole('navigation', { name: 'Java Quest 학습 단계' })
    fireEvent.click(within(updatedStageNavigation).getByRole('button', { name: /Java Applied/ }))

    await screen.findByRole('heading', { name: '1. 객체 역할' })
    expect(mockedApi.problems).toHaveBeenLastCalledWith('java-advanced')
    expect(screen.getByText('Java Quest / Java Applied / 객체지향 / 객체지향 설계')).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: '학습 카테고리' })).getAllByRole('button'))
      .toHaveLength(5)
  })

  it('continues from the final Java foundation category into Java Bridge', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '1. 문단 선택' })
    mockedApi.problems.mockResolvedValueOnce([{
      id: 311,
      category: 'java',
      number: 1,
      mode: 'java',
      stage: '변수·연산자',
      title: '기초 시작',
      question: '값을 반환하세요.',
      html: '',
      starterCode: 'public class Solution {}',
      examples: [],
      constraints: [],
      hints: ['return을 사용하세요.']
    }])
    const trackNavigation = screen.getByRole('navigation', { name: '학습 트랙' })
    fireEvent.click(within(trackNavigation).getByRole('button', { name: /Java Quest/ }))
    await screen.findByRole('heading', { name: '1. 기초 시작' })

    mockedApi.problems.mockResolvedValueOnce([{
      id: 312,
      category: 'java',
      number: 47,
      mode: 'java',
      stage: '배열·컬렉션',
      title: '기초 마지막',
      question: '배열의 길이를 반환하세요.',
      html: '',
      starterCode: 'public class Solution {}',
      examples: [],
      constraints: [],
      hints: ['length를 확인하세요.']
    }])
    fireEvent.click(within(screen.getByRole('navigation', { name: '학습 카테고리' }))
      .getByRole('button', { name: /배열·컬렉션/ }))
    await screen.findByRole('heading', { name: '1. 기초 마지막' })

    mockedApi.submit.mockResolvedValueOnce({
      correct: true,
      firstSolve: true,
      status: 'CORRECT',
      diagnosticCode: 'NONE',
      message: '정답입니다.',
      intentExplanation: '배열의 길이를 반환했습니다.',
      guidance: ''
    })
    const editor = screen.getByRole('textbox', { name: 'Java 답안' })
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    const bridgeAction = await screen.findByRole('button', {
      name: /Java Bridge · 타입·메서드로 계속하기/
    })
    expect(bridgeAction).toHaveTextContent('Ctrl/⌘↵')

    mockedApi.problems.mockResolvedValueOnce([{
      id: 313,
      category: 'java-bridge',
      number: 1,
      mode: 'java',
      stage: '타입·메서드 연결',
      title: 'Bridge 시작',
      question: '메서드를 호출하세요.',
      html: '',
      starterCode: 'public class Solution {}',
      examples: [],
      constraints: [],
      hints: ['메서드 이름을 확인하세요.']
    }])
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

    await screen.findByRole('heading', { name: '1. Bridge 시작' })
    expect(mockedApi.submit).toHaveBeenCalledTimes(1)
    expect(mockedApi.problems).toHaveBeenLastCalledWith('java-bridge')
    expect(within(screen.getByRole('navigation', { name: 'Java Quest 학습 단계' }))
      .getByRole('button', { name: /Java Bridge/ })).toHaveAttribute('aria-current', 'step')
  })

  it('ignores an older category response that finishes after the current category', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '1. 문단 선택' })
    const valuesRequest = deferred<Problem[]>()
    const controlRequest = deferred<Problem[]>()
    mockedApi.problems
      .mockImplementationOnce(() => valuesRequest.promise)
      .mockImplementationOnce(() => controlRequest.promise)

    fireEvent.click(screen.getByRole('button', { name: /JavaScript Quest/ }))
    fireEvent.click(await screen.findByRole('button', { name: /조건·반복/ }))

    await act(async () => {
      controlRequest.resolve([{
        id: 410,
        category: 'javascript',
        number: 7,
        mode: 'javascript',
        stage: '조건문·반복문',
        title: '배송비 결정',
        question: '조건에 맞는 배송비를 반환하세요.',
        html: '',
        starterCode: 'function solve(amount) {\n  return 0;\n}',
        examples: [],
        constraints: [],
        hints: ['조건을 확인하세요.']
      }])
      await controlRequest.promise
    })
    await screen.findByRole('heading', { name: '1. 배송비 결정' })

    await act(async () => {
      valuesRequest.resolve([{
        id: 404,
        category: 'javascript',
        number: 1,
        mode: 'javascript',
        stage: '변수·연산',
        title: '늦게 도착한 주문 합계',
        question: '합계를 반환하세요.',
        html: '',
        starterCode: 'function solve() {\n  return 0;\n}',
        examples: [],
        constraints: [],
        hints: ['값을 더하세요.']
      }])
      await valuesRequest.promise
    })

    expect(screen.getByRole('heading', { name: '1. 배송비 결정' })).toBeInTheDocument()
    expect(screen.queryByText('늦게 도착한 주문 합계')).not.toBeInTheDocument()
    expect(screen.getByText(/JavaScript Quest \/ 조건·반복/)).toBeInTheDocument()
  })

  it('removes the previous problem when the next category fails to load', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '1. 문단 선택' })
    mockedApi.problems.mockRejectedValueOnce(new Error('JavaScript 문제를 불러오지 못했습니다.'))

    fireEvent.click(screen.getByRole('button', { name: /JavaScript Quest/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('JavaScript 문제를 불러오지 못했습니다.')
    expect(screen.queryByRole('heading', { name: '1. 문단 선택' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'CSS 답안' })).not.toBeInTheDocument()
  })

  it('does not attach a late submission result to a different problem', async () => {
    const problems: Problem[] = [
      {
        id: 1,
        category: 'selector',
        number: 1,
        mode: 'selector',
        stage: '선택자 기초',
        title: '문단 선택',
        question: '모든 문단을 선택하세요.',
        html: '<main><p>첫 문단</p></main>',
        starterCode: '',
        examples: [],
        constraints: [],
        hints: ['태그 선택자를 사용하세요.']
      },
      {
        id: 2,
        category: 'selector',
        number: 2,
        mode: 'selector',
        stage: '선택자 기초',
        title: '제목 선택',
        question: '제목을 선택하세요.',
        html: '<main><h2>제목</h2></main>',
        starterCode: '',
        examples: [],
        constraints: [],
        hints: ['제목 태그를 사용하세요.']
      }
    ]
    const submissionRequest = deferred<Submission>()
    mockedApi.problems.mockResolvedValueOnce(problems)
    mockedApi.submit.mockImplementationOnce(() => submissionRequest.promise)
    render(<App />)
    await screen.findByRole('heading', { name: '1. 문단 선택' })

    fireEvent.change(screen.getByRole('textbox', { name: 'CSS 답안' }), { target: { value: 'p' } })
    fireEvent.click(screen.getByRole('button', { name: /정답 확인/ }))
    fireEvent.click(screen.getByRole('button', { name: '다음 →' }))
    await screen.findByRole('heading', { name: '2. 제목 선택' })

    await act(async () => {
      submissionRequest.resolve({
        correct: true,
        firstSolve: true,
        status: 'CORRECT',
        diagnosticCode: 'NONE',
        message: '이전 문제 정답입니다.',
        intentExplanation: '이전 문제의 출제 의도입니다.',
        guidance: ''
      })
      await submissionRequest.promise
    })

    expect(screen.getByRole('heading', { name: '2. 제목 선택' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText('이전 문제 정답입니다.')).not.toBeInTheDocument()
  })

  it('shows a correct selector as a readable step-by-step explanation', async () => {
    mockedApi.problems.mockResolvedValueOnce([{
      id: 18,
      category: 'selector',
      number: 18,
      mode: 'selector',
      stage: '구조 응용',
      title: '댓글',
      question: '삭제되지 않은 댓글의 작성자 이름만 선택하세요.',
      html: '<article class="comment"><span class="author">민수</span></article>',
      starterCode: '',
      examples: [],
      constraints: [],
      hints: ['제외 조건을 사용하세요.']
    }])
    mockedApi.submit.mockResolvedValueOnce({
      correct: true,
      firstSolve: true,
      status: 'CORRECT',
      diagnosticCode: 'NONE',
      message: '정답입니다.',
      intentExplanation: '숨겨져야 하는 기존의 일반 출제 의도입니다.',
      guidance: '목표 요소를 정확히 선택했습니다.',
      solution: {
        summary: '선택자의 조건을 왼쪽부터 읽어 보세요.',
        keyPoints: [],
        alternative: '같은 요소를 선택하는 다른 표현도 가능합니다.',
        complexity: 'DOM 관계를 차례로 확인합니다.',
        referenceAnswer: '.comment:not([data-deleted]) .author',
        selectorBreakdown: [
          { fragment: '.comment', explanation: '댓글을 찾습니다.' },
          {
            fragment: ':not([data-deleted])',
            explanation: '그중 삭제되지 않은 댓글만 남깁니다.'
          },
          {
            fragment: '.author',
            explanation: '해당 댓글 안에서 작성자 이름을 선택합니다.'
          }
        ]
      }
    })
    render(<App />)
    await screen.findByRole('heading', { name: /댓글/ })

    fireEvent.change(screen.getByRole('textbox', { name: 'CSS 답안' }), {
      target: { value: '.comment .author' }
    })
    fireEvent.click(screen.getByRole('button', { name: /정답 확인/ }))

    const review = await screen.findByRole('region', { name: '정답 선택자 해설' })
    expect(within(review).getByText('정답은 다음 CSS 선택자예요.')).toBeInTheDocument()
    expect(within(review).getByText('.comment:not([data-deleted]) .author')).toBeInTheDocument()
    expect(within(review).getAllByRole('listitem')).toHaveLength(3)
    expect(review).toHaveTextContent('.comment→댓글을 찾습니다.')
    expect(review).toHaveTextContent(':not([data-deleted])→그중 삭제되지 않은 댓글만 남깁니다.')
    expect(review).toHaveTextContent('.author→해당 댓글 안에서 작성자 이름을 선택합니다.')
    expect(screen.queryByText('숨겨져야 하는 기존의 일반 출제 의도입니다.')).not.toBeInTheDocument()
  })

  it('shows a source-contract failure without exposing a solution', async () => {
    mockedApi.problems.mockResolvedValueOnce([{
      id: 15,
      category: 'algorithm',
      number: 15,
      mode: 'algorithm',
      stage: '정렬·탐색',
      title: '삽입 정렬',
      question: 'solve 본문에서 삽입 정렬을 구현하세요.',
      html: '',
      starterCode: 'public class Solution {}',
      examples: [],
      constraints: ['정렬 반복문은 solve 본문에 직접 작성합니다.'],
      hints: ['현재 값을 임시 보관하세요.']
    }])
    mockedApi.submit.mockResolvedValueOnce({
      correct: false,
      firstSolve: false,
      status: 'INCORRECT',
      diagnosticCode: 'SOURCE_CONTRACT',
      message: '컴파일은 통과했지만 문제에서 요구한 알고리즘 구조와 달라요.',
      intentExplanation: '출제 의도: solve 본문에서 삽입 정렬을 구현합니다.',
      guidance: 'solve(int[]) 본문에 삽입 이동을 직접 작성해 주세요.',
      solution: {
        summary: '노출되면 안 되는 해설',
        keyPoints: ['노출되면 안 되는 정답 구조'],
        alternative: '없음',
        complexity: 'O(n²)'
      }
    })
    render(<App />)
    await screen.findByRole('heading', { name: '1. 삽입 정렬' })
    const editor = screen.getByRole('textbox', { name: 'Java 답안' })

    fireEvent.change(editor, { target: { value: 'public class Solution { }' } })
    fireEvent.click(screen.getByRole('button', { name: /코드 실행 및 채점/ }))

    const result = await screen.findByRole('status')
    expect(result).toHaveTextContent('컴파일은 통과했지만')
    expect(result).toHaveTextContent('요구 구조 불일치')
    expect(result).toHaveTextContent('solve(int[]) 본문')
    expect(screen.queryByText('SOLUTION REVIEW')).not.toBeInTheDocument()
    expect(screen.queryByText('노출되면 안 되는 해설')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /다음 문제 바로 풀기/ })).not.toBeInTheDocument()
    expect(editor).toHaveValue('public class Solution { }')
  })
})
