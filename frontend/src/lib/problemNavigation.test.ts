import { describe, expect, it } from 'vitest'
import { filterProblemGroups, groupProblemsByStage } from './problemNavigation'
import type { Problem } from '../types'

const problems = [
  { id: 1, number: 1, stage: '기초', title: '태그 선택자', question: 'p를 선택하세요' },
  { id: 2, number: 2, stage: '기초', title: '클래스 선택자', question: '.note를 선택하세요' },
  { id: 3, number: 3, stage: '응용', title: '자손 선택자', question: '자손을 선택하세요' }
].map(problem => ({
  ...problem,
  category: 'selector',
  mode: 'selector',
  html: '',
  starterCode: '',
  examples: [],
  constraints: [],
  hints: []
}) as Problem)

describe('problem navigation', () => {
  it('creates sequential stage ranges', () => {
    const groups = groupProblemsByStage(problems)
    expect(groups.map(({ stage, start, end }) => ({ stage, start, end }))).toEqual([
      { stage: '기초', start: 1, end: 2 },
      { stage: '응용', start: 3, end: 3 }
    ])
  })

  it('uses category-local display numbers without changing server problem numbers', () => {
    const scopedProblems = problems.slice(0, 2).map((problem, index) => ({
      ...problem,
      number: problem.number + 5,
      displayNumber: index + 1
    }))
    const [group] = groupProblemsByStage(scopedProblems)

    expect({ start: group.start, end: group.end }).toEqual({ start: 1, end: 2 })
    expect(scopedProblems.map(problem => problem.number)).toEqual([6, 7])
    expect(filterProblemGroups([group], '1', 'all', 'all', new Set())[0].problems[0].id).toBe(1)
  })

  it('searches problem numbers, titles and questions', () => {
    const groups = filterProblemGroups(groupProblemsByStage(problems), '클래스', 'all', 'all', new Set())
    expect(groups.flatMap(group => group.problems).map(problem => problem.number)).toEqual([2])
  })

  it('filters solved and unsolved problems', () => {
    const groups = groupProblemsByStage(problems)
    expect(filterProblemGroups(groups, '', 'all', 'solved', new Set([2]))[0].problems[0].id).toBe(2)
    expect(filterProblemGroups(groups, '', 'all', 'unsolved', new Set([2])).flatMap(group => group.problems)).toHaveLength(2)
  })
})
