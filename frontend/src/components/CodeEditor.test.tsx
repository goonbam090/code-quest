import {
  StrictMode,
  createRef,
  useState
} from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
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

async function findCompletionOption(label: string) {
  await waitFor(() => {
    expect(document.querySelector('.cm-tooltip-autocomplete')).toBeInTheDocument()
  })
  const option = Array.from(
    document.querySelectorAll<HTMLElement>('.cm-tooltip-autocomplete li')
  ).find(element => element.querySelector('.cm-completionLabel')?.textContent === label)
  expect(option).toBeDefined()
  return option!
}

function openCompletionAt(editor: HTMLElement, offset: number) {
  act(() => {
    editor.focus()
    fireEvent.keyDown(editor, { key: 'Home' })
    for (let position = 0; position < offset; position += 1) {
      fireEvent.keyDown(editor, { key: 'ArrowRight' })
    }
    fireEvent.keyDown(editor, { key: ' ', code: 'Space', ctrlKey: true })
  })
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

  it('inserts an HTML tag pair when its completion is selected with the mouse', async () => {
    render(<ControlledEditor initialValue="<l" language="html" />)
    const editor = screen.getByRole('textbox', { name: 'html 답안' })

    act(() => {
      editor.focus()
      fireEvent.keyDown(editor, { key: 'End' })
      fireEvent.keyDown(editor, { key: ' ', code: 'Space', ctrlKey: true })
    })
    const option = await findCompletionOption('li')
    fireEvent.mouseDown(option)

    expect(screen.getByTestId('controlled-value').textContent).toBe('<li></li>')
    expect(EditorView.findFromDOM(editor)?.state.selection.main.head)
      .toBe('<li>'.length)
  })

  it('inserts an HTML tag pair when completion starts immediately after <', async () => {
    render(<ControlledEditor initialValue="<" language="html" />)
    const editor = screen.getByRole('textbox', { name: 'html 답안' })

    act(() => {
      editor.focus()
      fireEvent.keyDown(editor, { key: 'End' })
      fireEvent.keyDown(editor, { key: ' ', code: 'Space', ctrlKey: true })
    })
    const option = await findCompletionOption('li')
    fireEvent.mouseDown(option)

    expect(screen.getByTestId('controlled-value').textContent).toBe('<li></li>')
    expect(EditorView.findFromDOM(editor)?.state.selection.main.head)
      .toBe('<li>'.length)
  })

  it.each([
    ['an existing tag terminator', '<l>', 'li', 2, '<li></li>'],
    [
      'existing attributes',
      '<l class="item">',
      'li',
      2,
      '<li class="item"></li>'
    ],
    [
      'an attribute value containing a tag terminator',
      '<l data-value=">">',
      'li',
      2,
      '<li data-value=">"></li>'
    ],
    [
      'an unfinished attribute',
      '<l class="item"',
      'li',
      2,
      '<li class="item"'
    ],
    [
      'existing content and a closing tag',
      '<l>item</li>',
      'li',
      2,
      '<li>item</li>'
    ],
    [
      'a self-closing tag',
      '<d class="item" />',
      'div',
      2,
      '<div class="item" />'
    ],
    ['a void element', '<im>', 'img', 3, '<img>']
  ])('preserves %s while completing an HTML tag pair', async (
    _case,
    source,
    completion,
    offset,
    expected
  ) => {
    render(<ControlledEditor initialValue={source} language="html" />)
    const editor = screen.getByRole('textbox', { name: 'html 답안' })

    openCompletionAt(editor, offset)
    const option = await findCompletionOption(completion)
    fireEvent.mouseDown(option)

    expect(screen.getByTestId('controlled-value').textContent).toBe(expected)
  })

  it('preserves multiple selections by completing tag names without adding pairs', async () => {
    render(<ControlledEditor initialValue={'<l>\n<l>'} language="html" />)
    const editor = screen.getByRole('textbox', { name: 'html 답안' })
    const view = EditorView.findFromDOM(editor)
    expect(view).not.toBeNull()

    act(() => {
      view!.dispatch({
        selection: EditorSelection.create([
          EditorSelection.cursor(2),
          EditorSelection.cursor(6)
        ])
      })
      fireEvent.keyDown(editor, { key: ' ', code: 'Space', ctrlKey: true })
    })
    const option = await findCompletionOption('li')
    fireEvent.mouseDown(option)

    expect(screen.getByTestId('controlled-value').textContent).toBe('<li>\n<li>')
    expect(view!.state.selection.ranges).toHaveLength(2)
  })

  it('inserts an HTML tag pair when its completion is accepted with Enter', async () => {
    render(<ControlledEditor initialValue="<li" language="html" />)
    const editor = screen.getByRole('textbox', { name: 'html 답안' })

    act(() => {
      editor.focus()
      fireEvent.keyDown(editor, { key: 'End' })
      fireEvent.keyDown(editor, { key: ' ', code: 'Space', ctrlKey: true })
    })
    await findCompletionOption('li')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 80))
    })
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(screen.getByTestId('controlled-value').textContent).toBe('<li></li>')
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

  it.each([
    [
      'html',
      '<main>\n<section>\n<p>Hello</p>\n</section>\n</main>',
      '<main>\n  <section>\n    <p>Hello</p>\n  </section>\n</main>'
    ],
    [
      'css',
      '.card {\ncolor: red;\n}',
      '.card {\n  color: red;\n}'
    ],
    [
      'javascript',
      'function answer() {\nif (true) {\nreturn 1;\n}\n}',
      'function answer() {\n  if (true) {\n    return 1;\n  }\n}'
    ],
    [
      'java',
      'class Main {\nstatic void run() {\nSystem.out.println("x");\n}\n}',
      'class Main {\n    static void run() {\n        System.out.println("x");\n    }\n}'
    ]
  ] as const)('reindents the entire %s document with Alt/Option+Shift+F', (
    language,
    source,
    expected
  ) => {
    render(<ControlledEditor initialValue={source} language={language} />)
    const editor = screen.getByRole('textbox', { name: `${language} 답안` })

    act(() => {
      editor.focus()
      fireEvent.keyDown(editor, {
        key: 'F',
        code: 'KeyF',
        altKey: true,
        shiftKey: true
      })
    })

    expect(screen.getByTestId('controlled-value').textContent).toBe(expected)
  })

  it.each([
    [
      'html',
      '<main>\n<pre>\nraw\n  indented\n</pre>\n<textarea>\nalpha\n  beta\n</textarea>\n</main>',
      '<main>\n  <pre>\nraw\n  indented\n</pre>\n  <textarea>\nalpha\n  beta\n</textarea>\n</main>'
    ],
    [
      'java',
      'class Main {\nstatic String text() {\nreturn """\nraw\n  indented\n""";\n}\n}',
      'class Main {\n    static String text() {\n        return """\nraw\n  indented\n""";\n    }\n}'
    ],
    [
      'css',
      '.card {\ncontent: "first\\\n second";\n}',
      '.card {\n  content: "first\\\n second";\n}'
    ]
  ] as const)('preserves whitespace-sensitive %s content while formatting', (
    language,
    source,
    expected
  ) => {
    render(<ControlledEditor initialValue={source} language={language} />)
    const editor = screen.getByRole('textbox', { name: `${language} 답안` })

    act(() => {
      editor.focus()
      fireEvent.keyDown(editor, {
        key: 'F',
        code: 'KeyF',
        altKey: true,
        shiftKey: true
      })
    })

    expect(screen.getByTestId('controlled-value').textContent).toBe(expected)
  })

  it('shows auto-indentation before autocomplete in the shortcut guide', () => {
    render(<ControlledEditor initialValue="" language="javascript" />)

    const shortcutGuide = screen.getByRole('note', { name: '에디터 단축키' })
    expect(shortcutGuide).toHaveTextContent('자동 들여쓰기 Alt/⌥ ⇧ F')
    expect(shortcutGuide).toHaveTextContent('자동 완성 Ctrl Space')
    expect(shortcutGuide.textContent?.indexOf('자동 들여쓰기'))
      .toBeLessThan(shortcutGuide.textContent?.indexOf('자동 완성') ?? 0)
  })

  it.each([
    ['Control', 'ctrlKey'],
    ['Command', 'metaKey']
  ] as const)('submits with %s+Enter without adding a line', (_label, modifier) => {
    const onSubmit = vi.fn()
    render(<ControlledEditor initialValue="return 42;" language="java" onSubmit={onSubmit} />)
    const editor = screen.getByRole('textbox', { name: 'java 답안' })

    fireEvent.keyDown(editor, { key: 'Enter', [modifier]: true })

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
