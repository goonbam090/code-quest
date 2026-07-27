import { createHandler, requireRunnerToken } from './server.js'

const token = 'server-test-token-0123456789abcdef'
const payload = {
  source: 'function solve(value) { return value; }',
  functionName: 'solve',
  sourceContract: 'none',
  tests: [{
    id: 'basic',
    visibility: 'PUBLIC',
    number: 1,
    label: '기본',
    input: 'value = 1',
    arguments: [1],
    expected: 1
  }]
}
const encoder = new TextEncoder()

function deferred() {
  let resolve
  const promise = new Promise(done => {
    resolve = done
  })
  return { promise, resolve }
}

function request(suppliedToken = token) {
  return new Request('http://runner/evaluate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Code-Quest-Javascript-Runner-Token': suppliedToken
    },
    body: JSON.stringify(payload)
  })
}

function trackedRequest(bodyText = JSON.stringify(payload), readGate = Promise.resolve()) {
  let reads = 0
  let delivered = false
  const readStarted = deferred()
  return {
    request: {
      url: 'http://runner/evaluate',
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/json',
        'X-Code-Quest-Javascript-Runner-Token': token
      }),
      body: {
        getReader() {
          return {
            async read() {
              reads++
              readStarted.resolve()
              await readGate
              if (delivered) return { done: true, value: undefined }
              delivered = true
              return { done: false, value: encoder.encode(bodyText) }
            },
            async cancel() {
              delivered = true
            }
          }
        }
      }
    },
    readStarted: readStarted.promise,
    readCount: () => reads
  }
}

Deno.test('인증되지 않은 채점 요청을 실행 전에 거부한다', async () => {
  let called = false
  const handler = createHandler(token, async () => {
    called = true
    return { status: 'PASSED' }
  })
  const response = await handler(request('wrong-token-that-is-long-enough-012345'))
  if (response.status !== 401 || called) {
    throw new Error(`status=${response.status}, called=${called}`)
  }
})

Deno.test('인증 직후 슬롯을 예약해 body 읽기와 평가 중인 추가 body를 읽지 않는다', async () => {
  const firstBodyGate = deferred()
  const evaluatorStarted = deferred()
  const evaluatorDone = deferred()
  const handler = createHandler(token, async () => {
    evaluatorStarted.resolve()
    await evaluatorDone.promise
    return {
      status: 'PASSED',
      details: '통과',
      errorLine: null,
      testReport: null
    }
  })

  const firstRequest = trackedRequest(JSON.stringify(payload), firstBodyGate.promise)
  const firstResponsePromise = handler(firstRequest.request)
  await firstRequest.readStarted

  const bodyReadCompetitor = trackedRequest()
  const bodyReadResponse = await handler(bodyReadCompetitor.request)
  if (bodyReadResponse.status !== 429 || bodyReadCompetitor.readCount() !== 0) {
    throw new Error(
      `body 읽기 경쟁 요청: status=${bodyReadResponse.status}, reads=${bodyReadCompetitor.readCount()}`
    )
  }

  firstBodyGate.resolve()
  await evaluatorStarted.promise

  const evaluationCompetitor = trackedRequest()
  const evaluationResponse = await handler(evaluationCompetitor.request)
  if (evaluationResponse.status !== 429 || evaluationCompetitor.readCount() !== 0) {
    throw new Error(
      `평가 경쟁 요청: status=${evaluationResponse.status}, reads=${evaluationCompetitor.readCount()}`
    )
  }

  evaluatorDone.resolve()
  if ((await firstResponsePromise).status !== 200) {
    throw new Error('첫 번째 요청이 정상 완료되지 않았습니다.')
  }

  const afterRelease = trackedRequest()
  const afterReleaseResponse = await handler(afterRelease.request)
  if (afterReleaseResponse.status !== 200 || afterRelease.readCount() === 0) {
    throw new Error(
      `슬롯 해제 후 요청: status=${afterReleaseResponse.status}, reads=${afterRelease.readCount()}`
    )
  }
})

Deno.test('body 파싱 실패 후에도 실행 슬롯을 해제한다', async () => {
  let calls = 0
  const handler = createHandler(token, async () => {
    calls++
    return { status: 'PASSED' }
  })

  const malformed = trackedRequest('{')
  const malformedResponse = await handler(malformed.request)
  const validResponse = await handler(request())
  if (malformedResponse.status !== 400 || validResponse.status !== 200 || calls !== 1) {
    throw new Error(
      `malformed=${malformedResponse.status}, valid=${validResponse.status}, calls=${calls}`
    )
  }
})

Deno.test('placeholder이거나 짧은 runner token을 거부한다', () => {
  for (const invalid of ['', 'short', 'replace-with-a-token']) {
    let rejected = false
    try {
      requireRunnerToken(invalid)
    } catch {
      rejected = true
    }
    if (!rejected) throw new Error(`허용된 token: ${invalid}`)
  }
})
