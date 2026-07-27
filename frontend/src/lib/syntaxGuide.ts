import type { Problem } from '../types'

export type SyntaxGuide = {
  code: string
  topics: string[]
}

const EXAMPLE_PREFIXES = ['비슷한 예시:', '다른 값의 예시:'] as const

export function createSyntaxGuide(
  problem?: Pick<Problem, 'mode' | 'hints'>
): SyntaxGuide | null {
  if (problem?.mode !== 'java' && problem?.mode !== 'javascript') return null

  const example = problem.hints
    .map(item => item.trimStart())
    .map(hint => ({
      hint,
      prefix: EXAMPLE_PREFIXES.find(prefix => hint.startsWith(prefix))
    }))
    .find(item => item.prefix)
  if (!example?.prefix) return null

  const code = example.hint.slice(example.prefix.length).trim()
  if (!code) return null

  if (problem.mode === 'javascript') {
    const topics: string[] = []
    if (/\b(?:const|let)\b/.test(code)) topics.push('변수·스코프')
    if (/\b(?:class|extends|constructor)\b/.test(code)) topics.push('클래스·객체')
    if (/\b(?:async|await|Promise)\b/.test(code)) topics.push('비동기')
    if (/\b(?:Map|Set)\b/.test(code)) topics.push('Map·Set')
    if (/\.(?:map|filter|reduce|find|findIndex|some|every)\s*\(/.test(code)) topics.push('배열 메서드')
    if (/=>|\.\.\./.test(code)) topics.push('함수 문법')
    if (/\bswitch\s*\(/.test(code)) topics.push('switch문')
    if (/\bif\s*\(/.test(code)) topics.push('조건문')
    if (/\b(?:for|while)\s*(?:\(|of\b|in\b)/.test(code)) topics.push('반복문')
    if (/\b(?:trim|slice|substring|includes|toLowerCase|toUpperCase)\s*\(/.test(code)) {
      topics.push('문자열')
    }
    if (topics.length === 0) topics.push('연산·함수')
    return { code, topics }
  }

  const topics: string[] = []
  if (/\b(?:class|abstract|extends|interface|record)\b/.test(code)) topics.push('객체지향')
  if (/\b(?:try|catch|throw|throws)\b/.test(code)) topics.push('예외 처리')
  if (/\bswitch\s*\(/.test(code)) topics.push('switch문')
  if (/\bif\s*\(/.test(code)) topics.push('조건문')
  if (/\b(?:for|while)\s*\(/.test(code)) topics.push('반복문')
  if (/\b(?:List|Set|Map|Arrays|ArrayList|HashSet|LinkedHashSet)\b/.test(code)) {
    topics.push('컬렉션·배열')
  }
  if (/\b(?:StringBuilder|charAt|substring|replace|repeat|strip|toUpperCase|lastIndexOf)\b/.test(code)) {
    topics.push('문자열')
  }
  if (/->|::|\b(?:stream|filter|map|collect|groupingBy|findFirst)\b/.test(code)) {
    topics.push('람다·스트림')
  }
  if (topics.length === 0) topics.push('연산·메서드')

  return { code, topics }
}
