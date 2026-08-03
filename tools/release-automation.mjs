import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const RELEASE_TAG_PATTERN = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/
const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/

function fail(message) {
  throw new Error(message)
}

function requireSourceCommit(sourceCommit) {
  if (
    typeof sourceCommit !== 'string'
    || !SOURCE_COMMIT_PATTERN.test(sourceCommit)
  ) {
    fail('source commit must be a full lowercase 40-character Git commit ID')
  }

  return sourceCommit
}

function requireRegularFile(filePath) {
  let fileStat

  try {
    fileStat = statSync(filePath)
  } catch {
    fail(`required release file is missing: ${filePath}`)
  }

  if (!fileStat.isFile()) {
    fail(`required release path is not a regular file: ${filePath}`)
  }
}

export function readUpgradeBaseline(filePath) {
  requireRegularFile(filePath)

  let baseline
  try {
    baseline = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    fail(`upgrade baseline is not valid JSON: ${filePath}`)
  }

  const expectedKeys = ['schemaVersion', 'sourceCommit', 'zipSha256']
  if (
    baseline === null
    || Array.isArray(baseline)
    || typeof baseline !== 'object'
    || JSON.stringify(Object.keys(baseline).sort())
      !== JSON.stringify(expectedKeys)
    || baseline.schemaVersion !== 1
  ) {
    fail('upgrade baseline must use schema version 1 and only the supported fields')
  }

  requireSourceCommit(baseline.sourceCommit)
  if (
    typeof baseline.zipSha256 !== 'string'
    || !SHA256_PATTERN.test(baseline.zipSha256)
  ) {
    fail('upgrade baseline ZIP SHA-256 must be 64 lowercase hexadecimal characters')
  }

  return baseline
}

function readZipEntry(zipPath, entryPath) {
  try {
    return execFileSync('unzip', ['-p', zipPath, entryPath], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024
    })
  } catch {
    fail(`could not read ${entryPath} from ${zipPath}`)
  }
}

function readZipComment(zipPath) {
  let output

  try {
    output = execFileSync('unzip', ['-z', zipPath], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024
    }).replaceAll('\r\n', '\n')
  } catch {
    fail(`could not read the ZIP comment from ${zipPath}`)
  }

  const firstNewline = output.indexOf('\n')
  if (firstNewline === -1) {
    fail(`ZIP comment output has an unexpected format: ${zipPath}`)
  }

  return output.slice(firstNewline + 1).replace(/\n$/, '')
}

export function parseReleaseTag(tag) {
  if (typeof tag !== 'string' || !RELEASE_TAG_PATTERN.test(tag)) {
    fail('release tag must use the stable SemVer format vMAJOR.MINOR.PATCH')
  }

  return {
    tag,
    version: tag.slice(1)
  }
}

function compareReleaseTags(leftTag, rightTag) {
  const leftParts = parseReleaseTag(leftTag).version.split('.').map(BigInt)
  const rightParts = parseReleaseTag(rightTag).version.split('.').map(BigInt)

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] < rightParts[index]) return -1
    if (leftParts[index] > rightParts[index]) return 1
  }

  return 0
}

export function validateReleaseOrder(tag, releases) {
  parseReleaseTag(tag)

  if (!Array.isArray(releases)) {
    fail('GitHub Releases response must be an array')
  }

  for (const release of releases) {
    if (
      release === null
      || typeof release !== 'object'
      || typeof release.tagName !== 'string'
      || typeof release.isDraft !== 'boolean'
      || typeof release.isPrerelease !== 'boolean'
    ) {
      fail('GitHub Releases response contains an invalid release')
    }
  }

  const stableTags = releases
    .filter((release) => (
      !release.isDraft
      && !release.isPrerelease
      && RELEASE_TAG_PATTERN.test(release.tagName)
    ))
    .map((release) => release.tagName)
    .sort((left, right) => compareReleaseTags(right, left))

  const previousTag = stableTags[0]
  if (previousTag && compareReleaseTags(tag, previousTag) <= 0) {
    fail(`release tag must be newer than ${previousTag}`)
  }

  return { previousTag: previousTag ?? '' }
}

export function selectSuccessfulMainCiRun(payload, sourceCommit) {
  requireSourceCommit(sourceCommit)

  if (
    payload === null
    || Array.isArray(payload)
    || typeof payload !== 'object'
    || !Array.isArray(payload.workflow_runs)
  ) {
    fail('GitHub Actions response does not contain workflow_runs')
  }

  const candidates = payload.workflow_runs.filter((run) => (
    run !== null
    && typeof run === 'object'
    && run.event === 'push'
    && run.head_branch === 'main'
    && run.head_sha === sourceCommit
    && run.status === 'completed'
    && run.conclusion === 'success'
    && Number.isSafeInteger(run.id)
    && run.id > 0
    && Number.isSafeInteger(run.run_attempt)
    && run.run_attempt > 0
  ))

  if (candidates.length === 0) {
    fail(`no successful main CI push run found for ${sourceCommit}`)
  }

  candidates.sort((left, right) => {
    const leftUpdatedAt = Date.parse(left.updated_at ?? '') || 0
    const rightUpdatedAt = Date.parse(right.updated_at ?? '') || 0

    return rightUpdatedAt - leftUpdatedAt
      || right.id - left.id
      || right.run_attempt - left.run_attempt
  })

  const selected = candidates[0]

  return {
    runId: String(selected.id),
    artifactName: `code-quest-release-${sourceCommit}-${selected.id}`
  }
}

export function verifyReleaseFiles(zipPath, expectedCommit) {
  requireSourceCommit(expectedCommit)

  if (path.basename(zipPath) !== 'code-quest.zip') {
    fail('release ZIP must be named code-quest.zip')
  }

  const manifestPath = `${zipPath}.manifest.json`
  const checksumPath = `${zipPath}.sha256`

  for (const releasePath of [zipPath, manifestPath, checksumPath]) {
    requireRegularFile(releasePath)
  }

  try {
    execFileSync('unzip', ['-tqq', zipPath], { stdio: 'pipe' })
  } catch {
    fail(`release ZIP failed its integrity check: ${zipPath}`)
  }

  const zipContents = readFileSync(zipPath)
  const actualHash = createHash('sha256').update(zipContents).digest('hex')
  const expectedChecksum = `${actualHash}  code-quest.zip\n`
  const actualChecksum = readFileSync(checksumPath, 'utf8')

  if (actualChecksum !== expectedChecksum) {
    fail('release checksum file does not match code-quest.zip')
  }

  const externalManifestFile = readFileSync(manifestPath, 'utf8')
  if (!externalManifestFile.endsWith('\n')) {
    fail('external release manifest must end with a newline')
  }

  const externalManifest = externalManifestFile.slice(0, -1)
  const internalManifest = readZipEntry(
    zipPath,
    'code-quest/RELEASE_MANIFEST.json'
  )

  if (internalManifest !== externalManifest) {
    fail('internal and external release manifests do not match')
  }

  let manifest
  try {
    manifest = JSON.parse(externalManifest)
  } catch {
    fail('release manifest is not valid JSON')
  }

  const manifestKeys = Object.keys(manifest).sort()
  const expectedKeys = ['product', 'schemaVersion', 'sourceCommit']
  if (
    JSON.stringify(manifestKeys) !== JSON.stringify(expectedKeys)
    || manifest.schemaVersion !== 1
    || manifest.product !== 'code-quest'
    || manifest.sourceCommit !== expectedCommit
  ) {
    fail('release manifest does not identify the expected source commit')
  }

  if (readZipComment(zipPath) !== expectedCommit) {
    fail('ZIP comment does not identify the expected source commit')
  }

  return {
    sourceCommit: expectedCommit,
    sha256: actualHash
  }
}

function printOutputs(outputs) {
  for (const [name, value] of Object.entries(outputs)) {
    console.log(`${name}=${value}`)
  }
}

function runCli() {
  const [command, ...args] = process.argv.slice(2)

  if (command === 'validate-tag' && args.length === 1) {
    const release = parseReleaseTag(args[0])
    printOutputs({ tag: release.tag, version: release.version })
    return
  }

  if (command === 'resolve-run' && args.length === 2) {
    const [runsPath, sourceCommit] = args
    let payload

    try {
      payload = JSON.parse(readFileSync(runsPath, 'utf8'))
    } catch {
      fail(`could not parse GitHub Actions response: ${runsPath}`)
    }

    const run = selectSuccessfulMainCiRun(payload, sourceCommit)
    printOutputs({
      'run-id': run.runId,
      'artifact-name': run.artifactName
    })
    return
  }

  if (command === 'validate-version' && args.length === 2) {
    const [tag, releasesPath] = args
    let releases

    try {
      releases = JSON.parse(readFileSync(releasesPath, 'utf8'))
    } catch {
      fail(`could not parse GitHub Releases response: ${releasesPath}`)
    }

    const order = validateReleaseOrder(tag, releases)
    printOutputs({ 'previous-tag': order.previousTag })
    return
  }

  if (command === 'verify-files' && args.length === 2) {
    const result = verifyReleaseFiles(args[0], args[1])
    console.log(`Verified release files for ${result.sourceCommit} (${result.sha256}).`)
    return
  }

  if (command === 'upgrade-baseline' && args.length === 1) {
    const baseline = readUpgradeBaseline(args[0])
    printOutputs({
      'baseline-commit': baseline.sourceCommit,
      'baseline-zip-sha256': baseline.zipSha256
    })
    return
  }

  fail(
    'usage: release-automation.mjs '
    + '<validate-tag TAG | validate-version TAG RELEASES_JSON '
    + '| resolve-run RUNS_JSON COMMIT | verify-files ZIP COMMIT '
    + '| upgrade-baseline BASELINE_JSON>'
  )
}

if (process.argv[1]?.endsWith('release-automation.mjs')) {
  try {
    runCli()
  } catch (error) {
    console.error(`Release automation failed: ${error.message}`)
    process.exitCode = 1
  }
}
