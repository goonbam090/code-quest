import type { Problem } from '../types'

export type ProblemGroup = {
  stage: string
  start: number
  end: number
  problems: Problem[]
}

export type ProgressFilter = 'all' | 'unsolved' | 'solved'

function displayNumber(problem: Problem) {
  return problem.displayNumber ?? problem.number
}

export function groupProblemsByStage(problems: Problem[]): ProblemGroup[] {
  return problems.reduce<ProblemGroup[]>((groups, problem) => {
    const last = groups.at(-1)
    const number = displayNumber(problem)
    if (!last || last.stage !== problem.stage) {
      groups.push({ stage: problem.stage, start: number, end: number, problems: [problem] })
    } else {
      last.end = number
      last.problems.push(problem)
    }
    return groups
  }, [])
}

export function filterProblemGroups(
  groups: ProblemGroup[],
  query: string,
  stage: string,
  progress: ProgressFilter,
  solvedIds: Set<number>
) {
  const keyword = query.trim().toLocaleLowerCase('ko')

  return groups
    .filter(group => stage === 'all' || group.stage === stage)
    .map(group => ({
      ...group,
      problems: group.problems.filter(problem => {
        const matchesKeyword = !keyword || [
          String(displayNumber(problem)), problem.stage, problem.title, problem.question
        ].some(value => value.toLocaleLowerCase('ko').includes(keyword))
        const solved = solvedIds.has(problem.id)
        const matchesProgress = progress === 'all' || (progress === 'solved' ? solved : !solved)
        return matchesKeyword && matchesProgress
      })
    }))
    .filter(group => group.problems.length > 0)
}
