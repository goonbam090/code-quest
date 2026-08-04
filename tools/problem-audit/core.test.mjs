import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  auditProblemCatalog,
  defineProblemAuditRule,
  problemAuditRules
} from './core.mjs'

const auditRoot = dirname(fileURLToPath(import.meta.url))
const problemsRoot = resolve(auditRoot, '../../backend/src/main/resources/problems')
const fixturePath = resolve(auditRoot, 'fixtures/rule-failures.json')

async function loadCatalogEntries() {
  const files = (await readdir(problemsRoot))
    .filter(file => file.endsWith('.json'))
    .sort()
  return Promise.all(files.map(async file => ({
    file,
    category: file.replace(/\.json$/, ''),
    catalog: JSON.parse(await readFile(resolve(problemsRoot, file), 'utf8'))
  })))
}

function resolveMutationTarget(entries, mutation) {
  const entry = entries.find(candidate => candidate.category === mutation.category)
  assert.ok(entry, `fixture category not found: ${mutation.category}`)
  if (mutation.problem === undefined) return entry.catalog
  const problem = entry.catalog.problems.find(candidate => candidate.id === mutation.problem)
  assert.ok(problem, `fixture problem not found: ${mutation.category}#${mutation.problem}`)
  return problem
}

function applyMutation(entries, mutation) {
  if (mutation.type === 'remove-catalog') {
    const index = entries.findIndex(entry => entry.category === mutation.category)
    assert.notEqual(index, -1, `fixture category not found: ${mutation.category}`)
    entries.splice(index, 1)
    return
  }

  const target = resolveMutationTarget(entries, mutation)
  const path = [...mutation.path]
  const finalKey = path.pop()
  const parent = path.reduce((value, key) => value[key], target)
  if (mutation.type === 'set') parent[finalKey] = mutation.value
  else if (mutation.type === 'delete') delete parent[finalKey]
  else assert.fail(`unsupported fixture mutation: ${mutation.type}`)
}

const catalogEntries = await loadCatalogEntries()
const ruleFailureFixtures = JSON.parse(await readFile(fixturePath, 'utf8'))

test('현재 문제 카탈로그가 모든 감사 규칙을 통과한다', () => {
  assert.deepEqual(auditProblemCatalog(catalogEntries).failures, [])
})

test('모든 감사 규칙에 독립된 실패 fixture가 있다', () => {
  assert.deepEqual(
    ruleFailureFixtures.map(fixture => fixture.ruleId).sort(),
    problemAuditRules.map(rule => rule.id).sort()
  )
})

for (const fixture of ruleFailureFixtures) {
  test(`${fixture.ruleId} 규칙의 효과를 독립적으로 측정한다`, () => {
    const entries = structuredClone(catalogEntries)
    applyMutation(entries, fixture.mutation)
    const targetRule = problemAuditRules.find(rule => rule.id === fixture.ruleId)
    assert.ok(targetRule)

    const targetFailures = auditProblemCatalog(entries, { rules: [targetRule] }).failures
    assert.ok(
      targetFailures.some(failure => failure.message === fixture.message),
      `${fixture.ruleId} did not report: ${fixture.message}`
    )
    assert.ok(targetFailures.every(failure => failure.ruleId === fixture.ruleId))

    const failuresWithoutTarget = auditProblemCatalog(entries, {
      rules: problemAuditRules.filter(rule => rule.id !== fixture.ruleId)
    }).failures
    assert.deepEqual(failuresWithoutTarget, [])
  })
}

test('새 규칙을 기존 코어 변경 없이 추가할 수 있다', () => {
  const customRule = defineProblemAuditRule('fixture.custom', ({ fail }) => {
    fail('fixture', 'custom failure')
  })

  assert.deepEqual(
    auditProblemCatalog(catalogEntries, { rules: [customRule] }).failures,
    [{ ruleId: 'fixture.custom', location: 'fixture', message: 'custom failure' }]
  )
})

test('중복된 규칙 id는 실행 전에 거부한다', () => {
  const duplicateRule = defineProblemAuditRule('fixture.duplicate', () => {})
  assert.throws(
    () => auditProblemCatalog(catalogEntries, { rules: [duplicateRule, duplicateRule] }),
    /중복된 문제 감사 규칙 id/
  )
})
