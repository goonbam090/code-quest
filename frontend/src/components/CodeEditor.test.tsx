import {
  StrictMode,
  createRef,
  useState
} from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CodeEditor } from './CodeEditor'
import type {
  CodeEditorHandle,
  CodeEditorLanguage
} from './CodeEditor'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function emptyDomRect(): DOMRect {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({})
  }
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => []
  })
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: emptyDomRect
  })
  Object.defineProperty(HTMLElement.prototype, 'getClientRects', {
    configurable: true,
    value: () => []
  })
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: emptyDomRect
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

afterAll(() => {
  vi.unstubAllGlobals()
})

function ControlledEditor({
  initialValue,
  language,
  onSubmit
}: {
  initialValue: string
  language: CodeEditorLanguage
  onSubmit?: () => void
}) {
  const [value, setValue] = useState(initialValue)
  return (
    <>
      <CodeEditor
        aria-label={`${language} 답안`}
        language={language}
        value={value}
        onChange={setValue}
        onSubmit={onSubmit}
      />
      <output data-testid="controlled-value">{value}</output>
    </>
  )
}

describe('CodeEditor', () => {
  it('exposes an accessible textbox with line numbers and syntax highlighting', () => {
    const { container } = render(
      <CodeEditor
        aria-label="HTML 답안"
        aria-describedby="editor-help"
        aria-invalid
        language="html"
        value={'<main>\n  <h1>제목</h1>\n</main>'}
        onChange={() => {}}
      />
    )

    const editor = screen.getByRole('textbox', { name: 'HTML 답안' })
    expect(editor).toHaveAttribute('aria-describedby', 'editor-help')
    expect(editor).toHaveAttribute('aria-invalid', 'true')
    expect(editor).toHaveAttribute('data-code-editor-input', 'true')
    expect(container.querySelector('.code-mirror-editor')).toHaveClass('is-invalid')
    expect(container.querySelector('.cm-lineNumbers')).toBeInTheDocument()
    expect(Array.from(container.querySelectorAll('.cm-lineNumbers .cm-gutterElement'))
      .map(element => element.textContent)
      .filter(Boolean)
      .slice(-3)).toEqual(['1', '2', '3'])
    expect(container.querySelector('.cm-line span')).toBeInTheDocument()
  })

  it('uses the CSS declaration grammar for property-answer fragments', () => {
    const { container } = render(
      <CodeEditor
        aria-label="CSS 답안"
        language="css"
        cssSyntaxMode="declarations"
        value="display: flex;"
        onChange={() => {}}
      />
    )

    expect(container.querySelector('.code-mirror-editor'))
      .toHaveAttribute('data-css-syntax', 'declarations')
    expect(screen.getByRole('textbox', { name: 'CSS 답안' })).toHaveTextContent('display: flex;')
    expect(Array.from(container.querySelectorAll('.cm-line span')).map(element => element.textContent))
      .toEqual(expect.arrayContaining(['display', 'flex']))
  })

  it('marks read-only code viewers without exposing an editable surface', () => {
    const { container } = render(
      <CodeEditor
        aria-label="Java 시작 코드"
        language="java"
        value={'class Demo {\n}'}
        onChange={() => {}}
        readOnly
      />
    )

    const viewer = screen.getByRole('textbox', { name: 'Java 시작 코드' })
    expect(viewer).toHaveAttribute('aria-readonly', 'true')
    expect(viewer).toHaveAttribute('contenteditable', 'false')
    expect(container.querySelector('.code-mirror-editor')).toHaveClass('is-read-only')
    expect(container.querySelectorAll('.cm-lineNumbers .cm-gutterElement')).toHaveLength(3)
  })

  it.each([
    ['html', '<main>', '  '],
    ['css', '.card {', '  '],
    ['javascript', 'function answer() {', '  '],
    ['java', 'class Main {', '    ']
  ] as const)('uses parser-aware Enter indentation for %s', (language, source, indentation) => {
    render(<ControlledEditor initialValue={source} language={language} />)
    const editor = screen.getByRole('textbox', { name: `${language} 답안` })

    act(() => {
      editor.focus()
      fireEvent.keyDown(editor, { key: 'End' })
      fireEvent.keyDown(editor, { key: 'Enter' })
    })

    expect(screen.getByTestId('controlled-value').textContent).toBe(`${source}\n${indentation}`)
  })

  it('indents with Tab and outdents with Shift+Tab', () => {
    render(<ControlledEditor initialValue="const answer = 1;" language="javascript" />)
    const editor = screen.getByRole('textbox', { name: 'javascript 답안' })

    act(() => {
      editor.focus()
      fireEvent.keyDown(editor, { key: 'Tab' })
    })
    expect(screen.getByTestId('controlled-value').textContent).toBe('  const answer = 1;')

    act(() => {
      fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })
    })
    expect(screen.getByTestId('controlled-value').textContent).toBe('const answer = 1;')
  })

  it('submits with Mod+Enter without adding a line', () => {
    const onSubmit = vi.fn()
    render(<ControlledEditor initialValue="return 42;" language="java" onSubmit={onSubmit} />)
    const editor = screen.getByRole('textbox', { name: 'java 답안' })

    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('controlled-value').textContent).toBe('return 42;')
  })

  it('lets keyboard users leave after Escape then Tab', () => {
    render(
      <>
        <button type="button">이전</button>
        <ControlledEditor initialValue="" language="html" />
        <button type="button">다음</button>
      </>
    )
    const editor = screen.getByRole('textbox', { name: 'html 답안' })

    act(() => {
      editor.focus()
      fireEvent.keyDown(editor, { key: 'Escape' })
      fireEvent.keyDown(editor, { key: 'Tab' })
    })

    expect(screen.getByRole('button', { name: '다음' })).toHaveFocus()
  })

  it('updates controlled content and focuses a requested one-based line', () => {
    const editorRef = createRef<CodeEditorHandle>()
    const { rerender } = render(
      <CodeEditor
        ref={editorRef}
        aria-label="Java 답안"
        language="java"
        value={'first\nsecond'}
        onChange={() => {}}
      />
    )

    rerender(
      <CodeEditor
        ref={editorRef}
        aria-label="Java 답안"
        language="java"
        value={'first\nsecond\nthird'}
        onChange={() => {}}
      />
    )
    act(() => editorRef.current?.focusLine(2))

    expect(screen.getByRole('textbox', { name: 'Java 답안' })).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'Java 답안' }).textContent)
      .toBe('firstsecondthird')
  })

  it('destroys its EditorView during StrictMode remounts and unmount', () => {
    const { container, unmount } = render(
      <StrictMode>
        <CodeEditor
          aria-label="CSS 답안"
          language="css"
          value=".card {}"
          onChange={() => {}}
        />
      </StrictMode>
    )
    expect(container.querySelectorAll('.cm-editor')).toHaveLength(1)

    unmount()

    expect(container.querySelector('.cm-editor')).not.toBeInTheDocument()
  })
})
