import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  parseReleaseTag,
  selectSuccessfulMainCiRun,
  validateReleaseOrder,
  verifyReleaseFiles
} from './release-automation.mjs'

const SOURCE_COMMIT = '0123456789abcdef0123456789abcdef01234567'
const PROJECT_DIR = fileURLToPath(new URL('..', import.meta.url))

function successfulRun(overrides = {}) {
  return {
    id: 100,
    run_attempt: 1,
    event: 'push',
    head_branch: 'main',
    head_sha: SOURCE_COMMIT,
    status: 'completed',
    conclusion: 'success',
    updated_at: '2026-08-02T00:00:00Z',
    ...overrides
  }
}

test('accepts stable SemVer release tags', () => {
  assert.deepEqual(parseReleaseTag('v0.1.0'), {
    tag: 'v0.1.0',
    version: '0.1.0'
  })
  assert.equal(parseReleaseTag('v12.34.56').version, '12.34.56')
})

test('rejects ambiguous or unstable release tags', () => {
  for (const tag of [
    '1.2.3',
    'v1.2',
    'v01.2.3',
    'v1.02.3',
    'v1.2.03',
    'v1.2.3-rc.1',
    'v1.2.3+build.1',
    'release-v1.2.3'
  ]) {
    assert.throws(() => parseReleaseTag(tag), /stable SemVer/)
  }
})

test('keeps the first stable version an explicit maintainer decision', () => {
  assert.deepEqual(validateReleaseOrder('v0.0.1', []), {
    previousTag: ''
  })
})

test('requires versions to increase from the highest published stable release', () => {
  const releases = [
    { tagName: 'v1.2.3', isDraft: false, isPrerelease: false },
    { tagName: 'v2.0.0-rc.1', isDraft: false, isPrerelease: true },
    { tagName: 'notes-only', isDraft: false, isPrerelease: false },
    { tagName: 'v9.0.0', isDraft: true, isPrerelease: false }
  ]

  assert.deepEqual(validateReleaseOrder('v1.3.0', releases), {
    previousTag: 'v1.2.3'
  })
  assert.throws(
    () => validateReleaseOrder('v1.2.3', releases),
    /newer than v1.2.3/
  )
  assert.throws(
    () => validateReleaseOrder('v1.2.2', releases),
    /newer than v1.2.3/
  )
})

test('rejects malformed GitHub Releases responses', () => {
  assert.throws(
    () => validateReleaseOrder('v1.0.0', {}),
    /must be an array/
  )
  assert.throws(
    () => validateReleaseOrder('v1.0.0', [{ tagName: 'v0.1.0' }]),
    /invalid release/
  )
})

test('verifies release files and rejects missing or modified sidecars', () => {
  const fixtureDirectory = mkdtempSync(
    path.join(tmpdir(), 'code-quest-release-test-')
  )
  const zipPath = path.join(fixtureDirectory, 'code-quest.zip')
  const manifestPath = `${zipPath}.manifest.json`
  const checksumPath = `${zipPath}.sha256`

  try {
    execFileSync(
      path.join(PROJECT_DIR, 'tools/build-release-zip.sh'),
      [zipPath],
      { cwd: PROJECT_DIR, stdio: 'ignore' }
    )
    const sourceCommit = execFileSync(
      'git',
      ['rev-parse', 'HEAD'],
      { cwd: PROJECT_DIR, encoding: 'utf8' }
    ).trim()
    const manifest = readFileSync(manifestPath, 'utf8')
    const checksum = readFileSync(checksumPath, 'utf8')

    assert.match(verifyReleaseFiles(zipPath, sourceCommit).sha256, /^[0-9a-f]{64}$/)

    writeFileSync(checksumPath, `${'0'.repeat(64)}  code-quest.zip\n`)
    assert.throws(
      () => verifyReleaseFiles(zipPath, sourceCommit),
      /checksum file does not match/
    )
    writeFileSync(checksumPath, checksum)

    unlinkSync(manifestPath)
    assert.throws(
      () => verifyReleaseFiles(zipPath, sourceCommit),
      /required release file is missing/
    )
    writeFileSync(manifestPath, manifest)

    writeFileSync(manifestPath, '{}\n')
    assert.throws(
      () => verifyReleaseFiles(zipPath, sourceCommit),
      /internal and external release manifests do not match/
    )
    writeFileSync(manifestPath, manifest)

    assert.throws(
      () => verifyReleaseFiles(zipPath, 'f'.repeat(40)),
      /expected source commit/
    )
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true })
  }
})

test('selects the newest successful main push CI run for the source commit', () => {
  const result = selectSuccessfulMainCiRun({
    workflow_runs: [
      successfulRun({
        id: 101,
        run_attempt: 2,
        updated_at: '2026-08-02T01:00:00Z'
      }),
      successfulRun()
    ]
  }, SOURCE_COMMIT)

  assert.deepEqual(result, {
    runId: '101',
    artifactName: `code-quest-release-${SOURCE_COMMIT}-101`
  })
})

test('ignores runs that do not prove a successful main push', () => {
  const invalidRuns = [
    successfulRun({ event: 'pull_request' }),
    successfulRun({ head_branch: 'feature/release' }),
    successfulRun({ head_sha: 'f'.repeat(40) }),
    successfulRun({ status: 'in_progress' }),
    successfulRun({ conclusion: 'failure' }),
    successfulRun({ id: 0 }),
    successfulRun({ run_attempt: 0 })
  ]

  assert.throws(
    () => selectSuccessfulMainCiRun({ workflow_runs: invalidRuns }, SOURCE_COMMIT),
    /no successful main CI push run/
  )
})

test('rejects malformed workflow responses and abbreviated commits', () => {
  assert.throws(
    () => selectSuccessfulMainCiRun({}, SOURCE_COMMIT),
    /workflow_runs/
  )
  assert.throws(
    () => selectSuccessfulMainCiRun({ workflow_runs: [] }, '0123456'),
    /full lowercase 40-character/
  )
})
