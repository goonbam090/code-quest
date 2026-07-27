import { evaluateJavaScript, validateEvaluationRequest } from './evaluator.js'

const TOKEN_NAME = 'JAVASCRIPT_RUNNER_TOKEN'
const TOKEN_HEADER = 'X-Code-Quest-Javascript-Runner-Token'
const MAX_REQUEST_BYTES = 180_000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function requireRunnerToken(token) {
  if (typeof token !== 'string' || encoder.encode(token).length < 32
      || /replace|change|example|placeholder/i.test(token)) {
    throw new Error(`${TOKEN_NAME} must be a non-placeholder secret of at least 32 bytes`)
  }
  return token
}

function secureEqual(expected, actual) {
  const left = encoder.encode(expected)
  const right = encoder.encode(actual ?? '')
  let different = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index++) {
    different |= (left[index % left.length] ?? 0) ^ (right[index % Math.max(right.length, 1)] ?? 0)
  }
  return different === 0
}

async function readBody(request) {
  const declared = Number.parseInt(request.headers.get('content-length') ?? '0', 10)
  if (declared > MAX_REQUEST_BYTES) throw new RangeError('요청 크기가 제한을 초과했습니다.')
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.length
    if (length > MAX_REQUEST_BYTES) {
      await reader.cancel()
      throw new RangeError('요청 크기가 제한을 초과했습니다.')
    }
    chunks.push(value)
  }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.length
  }
  return body
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  })
}

export function createHandler(token, evaluator = evaluateJavaScript) {
  const runnerToken = requireRunnerToken(token)
  let evaluationActive = false

  return async function handler(request) {
    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return request.method === 'GET'
        ? json(200, { status: 'UP' })
        : json(405, { status: 'METHOD_NOT_ALLOWED' })
    }
    if (url.pathname !== '/evaluate') return json(404, { status: 'NOT_FOUND' })
    if (request.method !== 'POST') return json(405, { status: 'METHOD_NOT_ALLOWED' })
    if (!secureEqual(runnerToken, request.headers.get(TOKEN_HEADER))) {
      return json(401, { status: 'UNAUTHORIZED' })
    }
    if (evaluationActive) {
      return json(429, {
        status: 'RUNNER_BUSY',
        details: '동시에 실행할 수 있는 채점 수를 초과했습니다.'
      })
    }
    // 인증된 요청은 body를 읽기 전에 단일 슬롯을 예약합니다. 그렇지 않으면 느린
    // streaming body 여러 개가 동시에 메모리에 쌓여 실행 제한을 우회할 수 있습니다.
    evaluationActive = true
    try {
      try {
        const raw = await readBody(request)
        const body = JSON.parse(decoder.decode(raw))
        validateEvaluationRequest(body)
        return json(200, await evaluator(body))
      } catch (error) {
        if (error instanceof RangeError) {
          return json(413, { status: 'INVALID_REQUEST', details: error.message })
        }
        if (error instanceof SyntaxError || error instanceof TypeError) {
          return json(400, {
            status: 'INVALID_REQUEST',
            details: error instanceof Error ? error.message : '요청 형식이 올바르지 않습니다.'
          })
        }
        console.error(error)
        return json(500, {
          status: 'UNAVAILABLE',
          details: 'JavaScript 채점기 내부 오류가 발생했습니다.'
        })
      }
    } finally {
      evaluationActive = false
    }
  }
}

if (import.meta.main) {
  const port = Number.parseInt(Deno.env.get('PORT') ?? '3003', 10)
  const handler = createHandler(Deno.env.get(TOKEN_NAME))
  Deno.serve({ hostname: '0.0.0.0', port, onListen() {
    console.log(`JavaScript runner listening on ${port}`)
  }}, handler)
}
