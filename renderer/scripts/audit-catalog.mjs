import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const rendererUrl = process.env.CSS_RENDERER_URL ?? 'http://localhost:3001'
const problemsRoot = resolve(process.cwd(), '../backend/src/main/resources/problems')
const categories = ['property', 'motion', 'flex', 'grid', 'responsive', 'ui']
const tasks = []

for (const category of categories) {
  const catalog = JSON.parse(await readFile(resolve(problemsRoot, `${category}.json`), 'utf8'))
  for (const problem of catalog.problems) {
    tasks.push({ category, problem })
  }
}

const failures = []
let completed = 0
let nextIndex = 0

async function worker() {
  while (nextIndex < tasks.length) {
    const task = tasks[nextIndex]
    nextIndex += 1
    try {
      const evaluate = async actualCss => {
        const response = await fetch(`${rendererUrl}/evaluate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            html: task.problem.html,
            expectedCss: task.problem.answer,
            actualCss,
            policy: task.problem.mode === 'stylesheet' || task.category === 'ui'
              ? 'visual'
              : 'computed',
            mode: task.problem.mode,
            validation: task.problem.required ?? null
          })
        })
        return { response, result: await response.json() }
      }
      const { response, result } = await evaluate(task.problem.answer)
      if (!response.ok || !result.matched || !result.syntaxValid) {
        failures.push({
          problem: `${task.category}#${task.problem.id}`,
          check: 'reference-answer',
          status: response.status,
          result
        })
      }

      if (task.problem.mode === 'stylesheet') {
        const starter = task.problem.starterCode ?? ''
        const negative = await evaluate(starter)
        if (negative.response.ok && negative.result.matched) {
          failures.push({
            problem: `${task.category}#${task.problem.id}`,
            check: 'starter-code-must-fail',
            status: negative.response.status,
            result: negative.result
          })
        }
      }
    } catch (error) {
      failures.push({
        problem: `${task.category}#${task.problem.id}`,
        error: error instanceof Error ? error.message : String(error)
      })
    }
    completed += 1
    if (completed % 50 === 0 || completed === tasks.length) {
      console.log(`${completed}/${tasks.length} 검증 완료`)
    }
  }
}

await Promise.all(Array.from({ length: 2 }, () => worker()))

if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2))
  process.exitCode = 1
} else {
  const stylesheetCount = tasks.filter(task => task.problem.mode === 'stylesheet').length
  console.log(`CSS 문제 ${tasks.length}개의 기준 답안과 stylesheet 시작 코드 ${stylesheetCount}개를 검증했습니다.`)
}
