import type { Problem } from '../types'

export type LearningUsage =
  | { kind: 'code'; value: string; note?: string }
  | { kind: 'context'; value: string }

export type LearningConcept = {
  overview: string
  usage: LearningUsage
  details: string[]
}

const EXAMPLE_MARKERS = [
  '비슷한 코드 예시:',
  '다른 값의 예시:',
  '비슷한 코드 패턴:',
  '비슷한 예시:',
  '조합 예시:',
  '제외 조건 예시:',
  '예:'
] as const

type MarkedExample = {
  code: string
  context: string
  note: string
}

function splitResultNote(example: MarkedExample): MarkedExample {
  const result = example.code.match(/^(.+?)의 결과는\s+(.+)$/)
    ?? example.code.match(/^(.+?[\)\]\}"'`\d])(?:은|는)\s+(.+)$/)
  if (!result) return example
  const resultNote = `결과는 ${result[2].trim()}`
  return {
    ...example,
    code: result[1].trim(),
    note: [resultNote, example.note].filter(Boolean).join(' ')
  }
}

function looksLikeCode(mode: Problem['mode'], value: string) {
  if (mode === 'selector' || mode === 'declaration' || mode === 'html') return true
  if (!/[가-힣]/.test(value)) return true
  return /[;{}]|=>|::|\+\+|--|===|!==|\?\?|\s\?\s.+\s:\s|&&|\|\||\b(?:return|throw|new|if|for|while|switch|case|class|interface|record|enum|function|const|let|var|static|final|public|private|protected|extends|implements|try|catch|import)\b|\w+\s*\([^)]*\)/.test(value)
}

function markedExample(hint: string): MarkedExample | null {
  const match = EXAMPLE_MARKERS
    .map(marker => ({ marker, index: hint.indexOf(marker) }))
    .filter(item => item.index >= 0)
    .sort((left, right) => left.index - right.index || right.marker.length - left.marker.length)[0]

  if (!match) return null

  const context = hint.slice(0, match.index).trim()
  const example = hint.slice(match.index + match.marker.length).trim()
  if (!example) return null

  const [code, ...noteParts] = example.split(/\s+[—–]\s+/)
  if (!code.trim()) return null
  return {
    code: code.trim(),
    context,
    note: noteParts.join(' — ').trim()
  }
}

function addUnique(items: string[], value: string) {
  const normalized = value.trim()
  if (normalized && !items.includes(normalized)) items.push(normalized)
}

export function createLearningConcept(
  problem: Pick<Problem, 'mode' | 'question' | 'hints' | 'constraints'>
): LearningConcept {
  const hints = problem.hints.map(hint => hint.trim()).filter(Boolean)
  const overview = hints[0] ?? problem.question
  const details: string[] = []
  let example: MarkedExample | null = null

  for (const [hintIndex, hint] of hints.entries()) {
    const marked = markedExample(hint)
    const nextExample = marked ? splitResultNote(marked) : null
    if (nextExample && !example) example = nextExample
    if (hintIndex === 0 && hint === overview) continue
    if (!nextExample) {
      addUnique(details, hint)
      continue
    }
    addUnique(details, nextExample.context)
    if (looksLikeCode(problem.mode, nextExample.code)) {
      addUnique(details, nextExample.note)
    } else {
      addUnique(details, nextExample.code)
      addUnique(details, nextExample.note)
    }
  }

  if (details.length < 2) {
    const constraint = problem.constraints.find(item => item.trim())
    if (constraint) addUnique(details, `실습에서 지킬 조건: ${constraint}`)
  }
  if (details.length === 0) addUnique(details, problem.question)

  return {
    overview,
    usage: example && looksLikeCode(problem.mode, example.code)
      ? { kind: 'code', value: example.code, ...(example.note ? { note: example.note } : {}) }
      : example
        ? { kind: 'context', value: [example.code, example.note].filter(Boolean).join(' ') }
      : { kind: 'context', value: hints[1] ?? problem.question },
    details: details.slice(0, 3)
  }
}
