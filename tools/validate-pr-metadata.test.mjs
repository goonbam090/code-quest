import assert from 'node:assert/strict'
import test from 'node:test'

import {
  validateEnvironment,
  validatePullRequestMetadata
} from './validate-pr-metadata.mjs'

const repository = 'goonbam090/code-quest'

function validate(overrides = {}) {
  return validatePullRequestMetadata({
    author: 'goonbam090',
    branch: 'feature/html-selector-search',
    title: '[Feature] HTML Selector Search',
    headRepository: repository,
    repository,
    ...overrides
  })
}

test('accepts every supported branch and matching PR title type', () => {
  const cases = [
    ['feature/search', '[Feature] Search'],
    ['refactor/problem-engine', '[Refactor] Problem Engine'],
    ['fix/question-reset', '[Fix] Question Reset'],
    ['docs/ai-rules', '[Docs] Add AI Rules'],
    ['chore/github-actions', '[Chore] Configure GitHub Actions'],
    ['test/selector-engine', '[Test] Selector Engine']
  ]

  for (const [branch, title] of cases) {
    assert.deepEqual(validate({ branch, title }), [])
  }
})

test('rejects unsupported branch types and non-kebab descriptions', () => {
  for (const branch of [
    'feat/html-selector-search',
    'feature/HTML-selector-search',
    'feature/html_selector_search',
    'feature/-html-selector',
    'feature/html-selector-',
    'feature/html--selector',
    'feature/html-selector/',
    'feature/html/selector',
    'feature/'
  ]) {
    assert.match(validate({ branch })[0], /Branch name must match/)
  }
})

test('rejects malformed and mismatched PR title types', () => {
  for (const title of [
    'Feature: HTML Selector Search',
    '[feature] HTML Selector Search',
    '[Unknown] HTML Selector Search',
    '[Feature]  HTML Selector Search',
    '[Feature] HTML Selector Search '
  ]) {
    assert.match(validate({ title })[0], /PR title must match/)
  }
  assert.match(
    validate({ title: '[Fix] HTML Selector Search' })[0],
    /does not match branch type/
  )
})

test('accepts non-English PR title text', () => {
  assert.deepEqual(validate({ title: '[Feature] HTML 선택자 검색' }), [])
})

test('applies branch and title rules to pull requests from forks', () => {
  assert.deepEqual(validate({
    branch: 'feature/contributor-search',
    headRepository: 'contributor/code-quest'
  }), [])
  assert.match(validate({
    branch: 'contributor/custom-branch',
    headRepository: 'contributor/code-quest'
  })[0], /Branch name must match/)
  assert.match(validate({
    branch: 'fix/contributor-search',
    headRepository: 'contributor/code-quest'
  })[0], /does not match branch type/)
})

test('accepts existing Dependabot branch and title conventions', () => {
  assert.deepEqual(validate({
    author: 'dependabot[bot]',
    branch: 'dependabot/npm_and_yarn/frontend/frontend-dependencies',
    title: 'Bump the frontend group with 3 updates'
  }), [])
  assert.deepEqual(validate({
    author: 'dependabot[bot]',
    branch: 'dependabot/github_actions/actions-checkout-7',
    title: '[Chore] Bump actions/checkout from 6 to 7'
  }), [])
})

test('rejects unexpected titles on Dependabot branches', () => {
  assert.match(validate({
    author: 'dependabot[bot]',
    branch: 'dependabot/npm_and_yarn/frontend/vite-9',
    title: 'Update Vite'
  })[0], /Dependabot PR titles/)
})

test('does not exempt collaborators using the Dependabot branch namespace', () => {
  assert.match(validate({
    branch: 'dependabot/npm_and_yarn/frontend/vite-9',
    title: '[Chore] Update Vite'
  })[0], /Branch name must match/)
})

test('reports missing workflow environment values', () => {
  assert.deepEqual(validateEnvironment({}), [
    'Missing required environment variables: PR_AUTHOR, PR_HEAD_REF, PR_TITLE, PR_HEAD_REPOSITORY, GITHUB_REPOSITORY'
  ])
})
