import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const rendererUrl = process.env.CSS_RENDERER_URL ?? 'http://localhost:3001'
const problemsRoot = resolve(process.cwd(), '../backend/src/main/resources/problems')
const categories = ['property', 'flex', 'grid', 'ui']
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
      const response = await fetch(`${rendererUrl}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: task.problem.html,
          expectedCss: task.problem.answer,
          actualCss: task.problem.answer,
          policy: task.category === 'ui' ? 'visual' : 'computed'
        })
      })
      const result = await response.json()
      if (!response.ok || !result.matched || !result.syntaxValid) {
        failures.push({
          problem: `${task.category}#${task.problem.id}`,
          status: response.status,
          result
        })
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

await Promise.all(Array.from({ length: 6 }, () => worker()))

if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2))
  process.exitCode = 1
} else {
  console.log(`선언형 문제 ${tasks.length}개가 모두 Chromium 기준 답안 검증을 통과했습니다.`)
}
