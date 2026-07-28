import { describe, expect, it } from 'vitest'
import {
  filterProblemGroups,
  groupProblemsByStage,
  splitProblemGroupsIntoUnits
} from './problemNavigation'
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

  it('splits each stage into ordered learning units of at most five problems', () => {
    const longStage = Array.from({ length: 12 }, (_, index) => ({
      ...problems[0],
      id: index + 1,
      number: index + 11,
      displayNumber: index + 1
    }))
    const units = splitProblemGroupsIntoUnits(groupProblemsByStage(longStage))

    expect(units.map(unit => ({
      id: unit.id,
      number: unit.number,
      numberInStage: unit.numberInStage,
      start: unit.start,
      end: unit.end,
      problemIds: unit.problems.map(problem => problem.id)
    }))).toEqual([
      {
        id: '1-1-1-5',
        number: 1,
        numberInStage: 1,
        start: 1,
        end: 5,
        problemIds: [1, 2, 3, 4, 5]
      },
      {
        id: '1-2-6-10',
        number: 2,
        numberInStage: 2,
        start: 6,
        end: 10,
        problemIds: [6, 7, 8, 9, 10]
      },
      {
        id: '1-3-11-12',
        number: 3,
        numberInStage: 3,
        start: 11,
        end: 12,
        problemIds: [11, 12]
      }
    ])
  })

  it('keeps stage boundaries when creating five-problem learning units', () => {
    const firstStage = Array.from({ length: 7 }, (_, index) => ({
      ...problems[0],
      id: index + 1,
      number: index + 1
    }))
    const secondStage = Array.from({ length: 3 }, (_, index) => ({
      ...problems[0],
      id: index + 8,
      number: index + 8,
      stage: '응용'
    }))
    const units = splitProblemGroupsIntoUnits(groupProblemsByStage([
      ...firstStage,
      ...secondStage
    ]))

    expect(units.map(unit => ({
      stage: unit.stage,
      range: `${unit.start}-${unit.end}`,
      size: unit.problems.length
    }))).toEqual([
      { stage: '기초', range: '1-5', size: 5 },
      { stage: '기초', range: '6-7', size: 2 },
      { stage: '응용', range: '8-10', size: 3 }
    ])
    expect(new Set(units.map(unit => unit.id))).toHaveProperty('size', units.length)
  })

  it('rejects invalid learning unit sizes', () => {
    expect(() => splitProblemGroupsIntoUnits(groupProblemsByStage(problems), 0))
      .toThrow('unitSize는 1 이상의 정수여야 합니다.')
  })
})
