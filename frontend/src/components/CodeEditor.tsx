import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from 'react'
import type { AriaAttributes } from 'react'
import { basicSetup } from 'codemirror'
import {
  indentLess,
  indentMore,
  insertNewlineAndIndent
} from '@codemirror/commands'
import { css, cssCompletionSource, cssLanguage } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import {
  HighlightStyle,
  LanguageSupport,
  indentUnit,
  syntaxHighlighting
} from '@codemirror/language'
import {
  Compartment,
  EditorState,
  Prec,
  Transaction
} from '@codemirror/state'
import {
  EditorView,
  keymap,
  placeholder as editorPlaceholder
} from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { tags } from '@lezer/highlight'

export type CodeEditorLanguage = 'html' | 'css' | 'javascript' | 'java'
export type CssSyntaxMode = 'stylesheet' | 'declarations'

export interface CodeEditorHandle {
  focus: (options?: FocusOptions) => void
  focusLine: (lineNumber: number) => void
  scrollIntoView: (options?: ScrollIntoViewOptions) => void
}

export interface CodeEditorProps {
  value: string
  language: CodeEditorLanguage
  cssSyntaxMode?: CssSyntaxMode
  onChange: (value: string) => void
  className?: string
  readOnly?: boolean
  placeholder?: string
  onSubmit?: () => void
  onBlur?: () => void
  onFocus?: () => void
  'aria-label': string
  'aria-describedby'?: string
  'aria-invalid'?: AriaAttributes['aria-invalid']
}

const codeQuestHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#c792ea' },
  { tag: [tags.name, tags.deleted, tags.character, tags.propertyName], color: '#f8f8f2' },
  { tag: [tags.function(tags.variableName), tags.labelName], color: '#82aaff' },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: '#ffcb6b' },
  { tag: [tags.definition(tags.name), tags.separator], color: '#89ddff' },
  { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier], color: '#f78c6c' },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link], color: '#89ddff' },
  { tag: [tags.meta, tags.comment], color: '#7f8c98', fontStyle: 'italic' },
  { tag: [tags.string, tags.special(tags.string), tags.inserted], color: '#c3e88d' },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: '#ff5370' },
  { tag: [tags.heading, tags.strong], color: '#ffcb6b', fontWeight: 'bold' },
  { tag: [tags.emphasis], color: '#c792ea', fontStyle: 'italic' },
  { tag: [tags.invalid], color: '#ffffff', backgroundColor: '#d73a49' }
])

const structuralTheme = EditorView.theme({
  '&': {
    height: '100%'
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    overflow: 'auto'
  },
  '.cm-content, .cm-gutters': {
    fontFamily: 'inherit'
  }
})

function languageExtension(
  language: CodeEditorLanguage,
  cssSyntaxMode: CssSyntaxMode
): Extension {
  switch (language) {
    case 'html':
      return html()
    case 'css':
      if (cssSyntaxMode === 'declarations') {
        const declarationsLanguage = cssLanguage.configure({ top: 'Styles' })
        return new LanguageSupport(
          declarationsLanguage,
          declarationsLanguage.data.of({ autocomplete: cssCompletionSource })
        )
      }
      return css()
    case 'javascript':
      return javascript()
    case 'java':
      return java()
  }
}

function indentWidth(language: CodeEditorLanguage) {
  return language === 'java' ? 4 : 2
}

function ariaInvalidIsTrue(value: AriaAttributes['aria-invalid']) {
  return value !== undefined && value !== false && value !== 'false'
}

function contentAttributes({
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
  readOnly
}: {
  ariaLabel: string
  ariaDescribedBy?: string
  ariaInvalid?: AriaAttributes['aria-invalid']
  readOnly: boolean
}) {
  const attributes: Record<string, string> = {
    class: 'code-mirror-editor__input',
    'data-code-editor-input': 'true',
    'aria-label': ariaLabel,
    'aria-multiline': 'true',
    role: 'textbox'
  }
  if (ariaDescribedBy) attributes['aria-describedby'] = ariaDescribedBy
  if (ariaInvalid !== undefined) attributes['aria-invalid'] = String(ariaInvalid)
  if (readOnly) attributes['aria-readonly'] = 'true'
  return EditorView.contentAttributes.of(attributes)
}

function moveFocusFromEditor(view: EditorView, backwards: boolean) {
  const selector = [
    'a[href]',
    'button:not(:disabled)',
    'input:not(:disabled)',
    'select:not(:disabled)',
    'textarea:not(:disabled)',
    'summary',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',')
  const focusable = Array.from(document.querySelectorAll<HTMLElement>(selector))
    .filter((element, index, all) => all.indexOf(element) === index)
    .filter(element => (
      !element.hasAttribute('hidden')
      && element.getAttribute('aria-hidden') !== 'true'
      && getComputedStyle(element).display !== 'none'
      && getComputedStyle(element).visibility !== 'hidden'
    ))
  const currentIndex = focusable.indexOf(view.contentDOM)
  const target = focusable[currentIndex + (backwards ? -1 : 1)]
  target?.focus()
  return true
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor({
  value,
  language,
  cssSyntaxMode = 'stylesheet',
  onChange,
  className,
  readOnly = false,
  placeholder,
  onSubmit,
  onBlur,
  onFocus,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid
}, forwardedRef) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSubmitRef = useRef(onSubmit)
  const onBlurRef = useRef(onBlur)
  const onFocusRef = useRef(onFocus)
  const syncingFromPropsRef = useRef(false)
  const tabExitArmedRef = useRef(false)
  const languageCompartmentRef = useRef(new Compartment())
  const indentCompartmentRef = useRef(new Compartment())
  const readOnlyCompartmentRef = useRef(new Compartment())
  const attributesCompartmentRef = useRef(new Compartment())
  const placeholderCompartmentRef = useRef(new Compartment())

  onChangeRef.current = onChange
  onSubmitRef.current = onSubmit
  onBlurRef.current = onBlur
  onFocusRef.current = onFocus

  useImperativeHandle(forwardedRef, () => ({
    focus(options) {
      const view = viewRef.current
      if (!view) return
      if (options) view.contentDOM.focus(options)
      else view.focus()
    },
    focusLine(lineNumber) {
      const view = viewRef.current
      if (!view) return
      const safeLineNumber = Math.min(Math.max(Math.trunc(lineNumber) || 1, 1), view.state.doc.lines)
      const line = view.state.doc.line(safeLineNumber)
      view.focus()
      view.dispatch({
        selection: { anchor: line.from, head: line.to },
        effects: EditorView.scrollIntoView(line.from, { y: 'center' })
      })
    },
    scrollIntoView(options) {
      hostRef.current?.scrollIntoView(options)
    }
  }), [])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return

    const width = indentWidth(language)
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        structuralTheme,
        syntaxHighlighting(codeQuestHighlightStyle),
        languageCompartmentRef.current.of(languageExtension(language, cssSyntaxMode)),
        indentCompartmentRef.current.of([
          EditorState.tabSize.of(width),
          indentUnit.of(' '.repeat(width))
        ]),
        readOnlyCompartmentRef.current.of([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly)
        ]),
        attributesCompartmentRef.current.of(contentAttributes({
          ariaLabel,
          ariaDescribedBy,
          ariaInvalid,
          readOnly
        })),
        placeholderCompartmentRef.current.of(placeholder ? editorPlaceholder(placeholder) : []),
        Prec.highest(keymap.of([
          {
            key: 'Escape',
            run: () => {
              tabExitArmedRef.current = true
              return true
            }
          },
          {
            key: 'Tab',
            preventDefault: true,
            run: view => {
              if (tabExitArmedRef.current || view.state.readOnly) {
                tabExitArmedRef.current = false
                return moveFocusFromEditor(view, false)
              }
              return indentMore(view)
            },
            shift: view => {
              if (tabExitArmedRef.current || view.state.readOnly) {
                tabExitArmedRef.current = false
                return moveFocusFromEditor(view, true)
              }
              return indentLess(view)
            }
          },
          {
            key: 'Mod-Enter',
            preventDefault: true,
            run: () => {
              tabExitArmedRef.current = false
              onSubmitRef.current?.()
              return true
            }
          },
          {
            key: 'Enter',
            run: view => {
              tabExitArmedRef.current = false
              return insertNewlineAndIndent(view)
            }
          }
        ])),
        EditorView.domEventHandlers({
          keydown(event) {
            if (event.key !== 'Escape' && event.key !== 'Tab') tabExitArmedRef.current = false
            return false
          },
          blur() {
            tabExitArmedRef.current = false
            onBlurRef.current?.()
            return false
          },
          focus() {
            onFocusRef.current?.()
            return false
          }
        }),
        EditorView.updateListener.of(update => {
          if (update.docChanged && !syncingFromPropsRef.current) {
            onChangeRef.current(update.state.doc.toString())
          }
        })
      ]
    })
    const view = new EditorView({ state, parent: host })
    viewRef.current = view

    return () => {
      if (viewRef.current === view) viewRef.current = null
      view.destroy()
    }
  }, [])

  useLayoutEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    syncingFromPropsRef.current = true
    try {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        annotations: Transaction.addToHistory.of(false)
      })
    } finally {
      syncingFromPropsRef.current = false
    }
  }, [value])

  useLayoutEffect(() => {
    const view = viewRef.current
    if (!view) return
    const width = indentWidth(language)
    view.dispatch({
      effects: [
        languageCompartmentRef.current.reconfigure(languageExtension(language, cssSyntaxMode)),
        indentCompartmentRef.current.reconfigure([
          EditorState.tabSize.of(width),
          indentUnit.of(' '.repeat(width))
        ])
      ]
    })
  }, [language, cssSyntaxMode])

  useLayoutEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: readOnlyCompartmentRef.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly)
      ])
    })
  }, [readOnly])

  useLayoutEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: attributesCompartmentRef.current.reconfigure(contentAttributes({
        ariaLabel,
        ariaDescribedBy,
        ariaInvalid,
        readOnly
      }))
    })
  }, [ariaLabel, ariaDescribedBy, ariaInvalid, readOnly])

  useLayoutEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: placeholderCompartmentRef.current.reconfigure(
        placeholder ? editorPlaceholder(placeholder) : []
      )
    })
  }, [placeholder])

  const rootClassName = [
    'code-mirror-editor',
    className,
    readOnly ? 'is-read-only' : '',
    ariaInvalidIsTrue(ariaInvalid) ? 'is-invalid' : ''
  ].filter(Boolean).join(' ')

  return (
    <div
      ref={hostRef}
      className={rootClassName}
      data-language={language}
      data-css-syntax={language === 'css' ? cssSyntaxMode : undefined}
      data-read-only={readOnly ? 'true' : 'false'}
    />
  )
})
