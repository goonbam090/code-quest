import { readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const problemsRoot = resolve(repositoryRoot, 'backend/src/main/resources/problems')
const apiRoot = (process.env.CODE_QUEST_API_URL ?? 'http://localhost:8080').replace(/\/+$/, '')
const learnerKey = `ci-reference-audit-${Date.now()}`
const requestedWorkerCount = Number.parseInt(process.env.CODE_QUEST_AUDIT_WORKERS ?? '2', 10)
const workerCount = Number.isInteger(requestedWorkerCount)
  ? Math.min(4, Math.max(1, requestedWorkerCount))
  : 2
const maxAttempts = 5
const tasks = []

for (const file of (await readdir(problemsRoot)).filter(file => file.endsWith('.json')).sort()) {
  const catalog = JSON.parse(await readFile(resolve(problemsRoot, file), 'utf8'))
  for (const problem of catalog.problems) {
    tasks.push({ category: catalog.id, problem })
  }
}

const failures = []
let completed = 0

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const retryDelay = attempt => {
  const base = 250 * (2 ** (attempt - 1))
  return base + Math.floor(Math.random() * base / 2)
}

async function assertApiReady() {
  try {
    const response = await fetch(`${apiRoot}/api/health`, {
      signal: AbortSignal.timeout(5_000)
    })
    const health = await response.json()
    if (!response.ok || health.status !== 'UP') {
      throw new Error(`readiness ${response.status} ${health.status ?? 'UNKNOWN'}`)
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Code Quest API에 연결할 수 없어 전수 검증을 시작하지 않았습니다: ${reason}`, {
      cause: error
    })
  }
}

async function submit(task) {
  let lastFailure
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(
        `${apiRoot}/api/problems/${encodeURIComponent(task.category)}/${task.problem.id}/submissions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ learnerKey, answer: task.problem.answer })
        }
      )
      const result = await response.json()
      const retryable = [429, 502, 503, 504].includes(response.status)
        || result.diagnosticCode === 'JUDGE_UNAVAILABLE'
      if (!retryable || attempt === maxAttempts) {
        return { response, result }
      }
      lastFailure = { response, result }
    } catch (error) {
      lastFailure = { error }
      if (attempt === maxAttempts) throw error
    }
    await wait(retryDelay(attempt))
  }
  if (lastFailure?.error) throw lastFailure.error
  return lastFailure
}

async function worker(list, state) {
  while (state.cursor < list.length) {
    const task = list[state.cursor++]
    try {
      const { response, result } = await submit(task)
      if (!response.ok || !result.correct) {
        failures.push({
          problem: `${task.category}#${task.problem.id}`,
          status: response.status,
          diagnosticCode: result.diagnosticCode,
          message: result.message,
          guidance: result.guidance
        })
      }
    } catch (error) {
      failures.push({
        problem: `${task.category}#${task.problem.id}`,
        error: error instanceof Error ? error.message : String(error)
      })
    }
    completed += 1
    if (completed % 25 === 0 || completed === tasks.length) {
      console.log(`${completed}/${tasks.length} 기준 답안 검증 완료`)
    }
  }
}

await assertApiReady()
const javaTasks = tasks.filter(
  task => task.problem.mode === 'java' || task.problem.mode === 'algorithm'
)
const javascriptTasks = tasks.filter(
  task => task.problem.mode === 'javascript'
)
const otherTasks = tasks.filter(
  task => task.problem.mode !== 'java'
    && task.problem.mode !== 'javascript'
    && task.problem.mode !== 'algorithm'
)
const javaQueueState = { cursor: 0 }
const javascriptQueueState = { cursor: 0 }
const otherQueueState = { cursor: 0 }

console.log(
  `기준 답안 감사 시작: Java/algorithm ${javaTasks.length}개(직렬 1 worker), `
  + `JavaScript ${javascriptTasks.length}개(직렬 1 worker), `
  + `마크업·스타일 ${otherTasks.length}개(${workerCount} workers)`
)

await Promise.all([
  worker(javaTasks, javaQueueState),
  worker(javascriptTasks, javascriptQueueState),
  ...Array.from(
    { length: Math.min(workerCount, otherTasks.length) },
    () => worker(otherTasks, otherQueueState)
  )
])

if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2))
  process.exitCode = 1
} else {
  console.log(`전체 ${tasks.length}문제의 기준 답안이 실제 채점 API를 통과했습니다.`)
}
