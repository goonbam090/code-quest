import { readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  auditProblemCatalog,
  formatProblemAuditFailure
} from './problem-audit/core.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const problemsRoot = resolve(repositoryRoot, 'backend/src/main/resources/problems')
const files = (await readdir(problemsRoot))
  .filter(file => file.endsWith('.json'))
  .sort()
const entries = await Promise.all(files.map(async file => ({
  file,
  category: file.replace(/\.json$/, ''),
  catalog: JSON.parse(await readFile(resolve(problemsRoot, file), 'utf8'))
})))
const result = auditProblemCatalog(entries)

if (result.failures.length > 0) {
  console.error(`문제 데이터 감사 실패 (${result.failures.length}건)`)
  for (const failure of result.failures) {
    console.error(`- ${formatProblemAuditFailure(failure)}`)
  }
  process.exitCode = 1
} else {
  console.log(`문제 데이터 감사 통과: ${result.summary.join(', ')} · 총 ${result.total}문제`)
}
