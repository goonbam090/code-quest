import http from 'node:http'
import { CssEvaluator } from './evaluator.js'

const PORT = Number(process.env.PORT ?? 3001)
const MAX_BODY_BYTES = 512 * 1024
const MAX_CONCURRENT_EVALUATIONS = 2
const evaluator = new CssEvaluator()
let activeEvaluations = 0

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new RangeError('요청 본문이 너무 큽니다.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    const healthy = await evaluator.healthy()
    json(response, healthy ? 200 : 503, { status: healthy ? 'UP' : 'DOWN' })
    return
  }
  if (request.method !== 'POST' || request.url !== '/evaluate') {
    json(response, 404, { message: 'Not Found' })
    return
  }
  if (activeEvaluations >= MAX_CONCURRENT_EVALUATIONS) {
    json(response, 429, { code: 'RENDERER_BUSY', message: '채점기가 사용 중입니다. 잠시 후 다시 시도해 주세요.' })
    return
  }

  activeEvaluations += 1
  try {
    const payload = await readJson(request)
    json(response, 200, await evaluator.evaluate(payload))
  } catch (error) {
    const clientError = error instanceof SyntaxError
      || error instanceof TypeError
      || error instanceof RangeError
    json(response, clientError ? 400 : 500, {
      message: error instanceof Error ? error.message : '브라우저 채점에 실패했습니다.'
    })
  } finally {
    activeEvaluations -= 1
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`CSS renderer listening on ${PORT}`)
})

async function shutdown() {
  server.close()
  await evaluator.close()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
