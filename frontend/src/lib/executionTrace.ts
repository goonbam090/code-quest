import type { Problem } from '../types'
import { createSyntaxGuide } from './syntaxGuide'

export type ExecutionTrace = {
  exampleInput: string
  exampleOutput: string
  curated: boolean
  steps: Array<{ label: string; state: string; detail: string }>
}

export function createExecutionTrace(problem?: Problem): ExecutionTrace | null {
  if (problem?.mode !== 'java' && problem?.mode !== 'javascript') return null
  const example = problem.examples[0]
  if (!example) return null

  if (example.trace?.length) {
    return {
      exampleInput: example.input,
      exampleOutput: example.output,
      curated: true,
      steps: example.trace
    }
  }

  const syntax = createSyntaxGuide(problem)
  return {
    exampleInput: example.input,
    exampleOutput: example.output,
    curated: false,
    steps: [
      {
        label: '입력',
        state: example.input,
        detail: `공개 예제의 값이 solve ${problem.mode === 'javascript' ? '함수' : '메서드'}에 전달됩니다.`
      },
      {
        label: syntax?.topics[0] ?? '처리',
        state: syntax?.code ?? '문제 조건에 맞게 값을 처리합니다.',
        detail: '문법 형태를 참고해 입력값이 어떻게 바뀌는지 따라가 보세요.'
      },
      {
        label: '반환',
        state: `return ${example.output}`,
        detail: '공개 예제에서 기대하는 최종 결과입니다.'
      }
    ]
  }
}
