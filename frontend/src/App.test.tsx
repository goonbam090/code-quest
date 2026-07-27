import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'
import { api } from './lib/api'
import type { Problem, Submission } from './types'

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
      focus: () => inputRef.current?.focus(),
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

describe('App accessibility', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('codequest-learner', 'accessibility-test')
    localStorage.setItem('codequest-last-track', 'css')
    localStorage.setItem('codequest-last-category', 'selector')
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
  })

  it('moves focus to the new problem after the result action removes itself', async () => {
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

    fireEvent.change(screen.getByRole('textbox', { name: 'CSS 답안' }), { target: { value: 'p' } })
    fireEvent.click(screen.getByRole('button', { name: /정답 확인/ }))
    fireEvent.click(await screen.findByRole('button', { name: /다음 문제 바로 풀기/ }))

    const nextHeading = await screen.findByRole('heading', { name: '2. 제목 선택' })
    await vi.waitFor(() => expect(nextHeading).toHaveFocus())
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
    fireEvent.click(screen.getByRole('button', { name: /코드 실행 및 채점/ }))
    const bridgeAction = await screen.findByRole('button', {
      name: /Java Bridge · 타입·메서드로 계속하기/
    })

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
    fireEvent.click(bridgeAction)

    await screen.findByRole('heading', { name: '1. Bridge 시작' })
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
