import { describe, expect, it } from 'vitest'
import { createExecutionTrace } from './executionTrace'
import type { Problem } from '../types'

function javaProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    id: 1,
    category: 'java',
    number: 1,
    mode: 'java',
    stage: '조건문·반복문',
    title: '테스트 문제',
    question: '문제를 해결하세요.',
    html: '',
    starterCode: 'public class Solution {}',
    examples: [{
      input: 'n = 3',
      output: '6',
      trace: []
    }],
    constraints: [],
    hints: ['비슷한 예시: for (int i = 0; i < n; i++) sum += i;'],
    ...overrides
  }
}

describe('createExecutionTrace', () => {
  it('uses curated variable changes when the example provides them', () => {
    const trace = createExecutionTrace(javaProblem({
      examples: [{
        input: 'n = 3',
        output: '6',
        trace: [{ label: '1회', state: 'sum = 1', detail: '첫 값을 더합니다.' }]
      }]
    }))

    expect(trace?.curated).toBe(true)
    expect(trace?.steps[0].state).toBe('sum = 1')
  })

  it('creates a safe syntax-based fallback without a reference answer', () => {
    const trace = createExecutionTrace(javaProblem())

    expect(trace?.curated).toBe(false)
    expect(trace?.steps.map(step => step.label)).toEqual(['입력', '반복문', '반환'])
    expect(trace?.steps[1].state).toContain('for')
  })

  it('does not create a walkthrough for algorithm problems', () => {
    expect(createExecutionTrace(javaProblem({ mode: 'algorithm' }))).toBeNull()
  })

  it('uses function wording for JavaScript problems', () => {
    const trace = createExecutionTrace(javaProblem({
      category: 'javascript',
      mode: 'javascript',
      starterCode: 'function solve(n) {}',
      hints: ['비슷한 예시: for (let i = 0; i < n; i++) total += i;']
    }))

    expect(trace?.steps[0].detail).toContain('solve 함수')
    expect(trace?.steps[1].label).toBe('변수·스코프')
  })
})
