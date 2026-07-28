import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findUnsuccessfulJobs,
  verifyRequiredJobResults
} from './verify-ci-results.mjs'

test('accepts only successful required jobs', () => {
  assert.deepEqual(findUnsuccessfulJobs({
    catalog: { result: 'success' },
    frontend: { result: 'success' },
    integration: { result: 'success' }
  }), [])
})

test('reports failed, skipped, cancelled, and missing results', () => {
  assert.deepEqual(findUnsuccessfulJobs({
    backend: { result: 'failure' },
    frontend: { result: 'skipped' },
    renderer: { result: 'cancelled' },
    integration: {}
  }), [
    'backend: failure',
    'frontend: skipped',
    'renderer: cancelled',
    'integration: missing'
  ])
})

test('parses the serialized needs context', () => {
  assert.deepEqual(verifyRequiredJobResults(JSON.stringify({
    catalog: { result: 'success', outputs: {} }
  })), [])
})

test('rejects missing, malformed, and empty needs contexts', () => {
  assert.deepEqual(verifyRequiredJobResults(''), [
    'Required job results are not valid JSON.'
  ])
  assert.deepEqual(verifyRequiredJobResults('{}'), [
    'No required job results were provided.'
  ])
  assert.deepEqual(verifyRequiredJobResults('[]'), [
    'No required job results were provided.'
  ])
})
