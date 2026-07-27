const apiRoot = (process.env.CODE_QUEST_API_URL ?? 'http://localhost:8080').replace(/\/+$/, '')
const mode = process.argv[2]
const allowedModes = new Set([
  'cases',
  'concurrency',
  'renderer-outage',
  'javascript-runner-outage'
])
const requestTimeoutMs = 60_000
const runId = `${Date.now().toString(36)}-${process.pid.toString(36)}`

if (!allowedModes.has(mode)) {
  console.error(
    '사용법: node tools/audit-grading-contracts.mjs '
    + '<cases|concurrency|renderer-outage|javascript-runner-outage>'
  )
  process.exit(2)
}

const javaSumAlternative = `
public class Solution {
    public static int solve(int a, int b) {
        return Math.addExact(a, b);
    }
}`.trim()

const javaSumConceptError = `
public class Solution {
    public static int solve(int a, int b) {
        return a - b;
    }
}`.trim()

const javaSumSyntaxError = `
public class Solution {
    public static int solve(int a, int b) {
        return a + b
    }
}`.trim()

const rectangleAlternative = `
public class Solution {}

final class Rectangle {
    private final int width;
    private final int height;

    Rectangle(int width, int height) {
        if (Math.min(width, height) < 1) {
            throw new IllegalArgumentException("positive dimensions required");
        }
        this.width = width;
        this.height = height;
    }

    int area() {
        return Math.multiplyExact(width, height);
    }

    int perimeter() {
        return Math.multiplyExact(2, Math.addExact(width, height));
    }
}`.trim()

const rectangleConceptError = `
public class Solution {}

final class Rectangle {
    private final int width;
    private final int height;

    Rectangle(int width, int height) {
        this.width = width;
        this.height = height;
    }

    int area() {
        return width * height;
    }

    int perimeter() {
        return 2 * (width + height);
    }
}`.trim()

const rotateAlternative = `
public class Solution {
    public static int[] solve(int[] numbers, int k) {
        int offset = k % numbers.length;
        int[] rotated = new int[numbers.length];
        int tailLength = numbers.length - offset;
        System.arraycopy(numbers, offset, rotated, 0, tailLength);
        System.arraycopy(numbers, 0, rotated, tailLength, offset);
        return rotated;
    }
}`.trim()

const rotateMutatesInput = `
public class Solution {
    public static int[] solve(int[] numbers, int k) {
        int offset = k % numbers.length;
        reverse(numbers, 0, offset - 1);
        reverse(numbers, offset, numbers.length - 1);
        reverse(numbers, 0, numbers.length - 1);
        return numbers;
    }

    private static void reverse(int[] values, int left, int right) {
        while (left < right) {
            int temporary = values[left];
            values[left++] = values[right];
            values[right--] = temporary;
        }
    }
}`.trim()

const rotateTooSlow = `
public class Solution {
    public static int[] solve(int[] numbers, int k) {
        int[] rotated = numbers.clone();
        int offset = k % rotated.length;
        for (int step = 0; step < offset; step++) {
            int first = rotated[0];
            for (int index = 1; index < rotated.length; index++) {
                rotated[index - 1] = rotated[index];
            }
            rotated[rotated.length - 1] = first;
        }
        return rotated;
    }
}`.trim()

const insertionSortShortcut = `
import java.util.Arrays;

public class Solution {
    public static int[] solve(int[] numbers) {
        int[] sorted = numbers.clone();
        Arrays.sort(sorted);
        return sorted;
    }
}`.trim()

const javascriptAlternative = `
function solve(unitPrice, quantity, deliveryFee) {
  return deliveryFee + quantity * unitPrice;
}`.trim()

const javascriptConceptError = `
function solve(unitPrice, quantity, deliveryFee) {
  return unitPrice + quantity + deliveryFee;
}`.trim()

const javascriptSyntaxError = `
function solve(unitPrice, quantity, deliveryFee) {
  return unitPrice * quantity + deliveryFee;
`.trim()

const javascriptForbiddenApi = `
function solve() {
  return fetch("http://backend:8080/api/health");
}`.trim()

const javascriptRestShortcut = `
function solve() {
  return Array.from(arguments).reduce((sum, value) => sum + value, 0);
}`.trim()

const javascriptMutatesInput = `
function solve(values) {
  const adjusted = values.map((value, index) => value + index);
  values.push(0);
  return adjusted;
}`.trim()

const javascriptReturnsInputObject = `
function solve(defaults, overrides) {
  Object.assign(defaults, overrides);
  return defaults;
}`.trim()

const javascriptRuntimeError = `
function solve() {
  throw new Error("의도적인 실행 오류");
}`.trim()

const javascriptInfiniteLoop = `
function solve() {
  while (true) {
    // 시간 제한 검증
  }
}`.trim()

const gradingCases = [
  {
    id: 'selector-alternative',
    category: 'selector',
    number: 1,
    answer: 'main > p',
    status: 'CORRECT',
    diagnosticCode: 'NONE'
  },
  {
    id: 'selector-concept-error',
    category: 'selector',
    number: 1,
    answer: 'h2',
    status: 'INCORRECT',
    diagnosticCode: 'SELECTOR_MISMATCH'
  },
  {
    id: 'selector-typo',
    category: 'selector',
    number: 2,
    answer: '.ntoe',
    status: 'TYPO',
    diagnosticCode: 'SELECTOR_TYPO'
  },
  {
    id: 'selector-syntax',
    category: 'selector',
    number: 1,
    answer: 'p[',
    status: 'SYNTAX',
    diagnosticCode: 'SELECTOR_SYNTAX'
  },
  {
    id: 'blank-answer',
    category: 'selector',
    number: 1,
    answer: '   ',
    status: 'EMPTY',
    diagnosticCode: 'EMPTY_ANSWER'
  },
  {
    id: 'declaration-alternative',
    category: 'property',
    number: 1,
    answer: 'color: #ff0000;',
    status: 'CORRECT',
    diagnosticCode: 'NONE'
  },
  {
    id: 'declaration-concept-error',
    category: 'property',
    number: 1,
    answer: 'color: blue;',
    status: 'INCORRECT',
    diagnosticCode: 'VALUE_MISMATCH'
  },
  {
    id: 'declaration-property-typo',
    category: 'property',
    number: 1,
    answer: 'colour: red;',
    status: 'TYPO',
    diagnosticCode: 'PROPERTY_NAME_TYPO'
  },
  {
    id: 'html-alternative',
    category: 'html',
    number: 1,
    answer: '<main><h1>다른 제목</h1><p>다른 설명입니다.</p></main>',
    status: 'CORRECT',
    diagnosticCode: 'NONE'
  },
  {
    id: 'html-concept-error',
    category: 'html',
    number: 5,
    answer: '<main><h1>로드맵</h1><section><h2>HTML</h2><h2>CSS</h2></section><section></section></main>',
    status: 'INCORRECT',
    diagnosticCode: 'HTML_STRUCTURE_MISMATCH'
  },
  {
    id: 'html-unsafe-syntax',
    category: 'html',
    number: 1,
    answer: '<main><h1>제목</h1><p>설명</p><script>alert(1)</script></main>',
    status: 'SYNTAX',
    diagnosticCode: 'HTML_UNSAFE_CONTENT'
  },
  {
    id: 'java-alternative',
    category: 'java',
    number: 1,
    answer: javaSumAlternative,
    status: 'CORRECT',
    diagnosticCode: 'NONE'
  },
  {
    id: 'java-concept-error',
    category: 'java',
    number: 1,
    answer: javaSumConceptError,
    status: 'INCORRECT',
    diagnosticCode: 'TEST_FAILURE'
  },
  {
    id: 'java-syntax',
    category: 'java',
    number: 1,
    answer: javaSumSyntaxError,
    status: 'SYNTAX',
    diagnosticCode: 'COMPILE_ERROR'
  },
  {
    id: 'java-advanced-alternative',
    category: 'java-advanced',
    number: 1,
    answer: rectangleAlternative,
    status: 'CORRECT',
    diagnosticCode: 'NONE'
  },
  {
    id: 'java-advanced-concept-error',
    category: 'java-advanced',
    number: 1,
    answer: rectangleConceptError,
    status: 'INCORRECT',
    diagnosticCode: 'TEST_FAILURE'
  },
  {
    id: 'algorithm-7-alternative-and-input-contract',
    category: 'algorithm',
    number: 7,
    answer: rotateAlternative,
    status: 'CORRECT',
    diagnosticCode: 'NONE'
  },
  {
    id: 'algorithm-7-input-mutation',
    category: 'algorithm',
    number: 7,
    answer: rotateMutatesInput,
    status: 'INCORRECT',
    diagnosticCode: 'TEST_FAILURE'
  },
  {
    id: 'algorithm-7-time-limit',
    category: 'algorithm',
    number: 7,
    answer: rotateTooSlow,
    status: 'INCORRECT',
    diagnosticCode: 'TIME_LIMIT'
  },
  {
    id: 'algorithm-15-standard-sort-shortcut',
    category: 'algorithm',
    number: 15,
    answer: insertionSortShortcut,
    status: 'INCORRECT',
    diagnosticCode: 'SOURCE_CONTRACT'
  },
  {
    id: 'javascript-alternative',
    category: 'javascript',
    number: 1,
    answer: javascriptAlternative,
    status: 'CORRECT',
    diagnosticCode: 'NONE'
  },
  {
    id: 'javascript-concept-error',
    category: 'javascript',
    number: 1,
    answer: javascriptConceptError,
    status: 'INCORRECT',
    diagnosticCode: 'TEST_FAILURE'
  },
  {
    id: 'javascript-syntax',
    category: 'javascript',
    number: 1,
    answer: javascriptSyntaxError,
    status: 'SYNTAX',
    diagnosticCode: 'COMPILE_ERROR'
  },
  {
    id: 'javascript-forbidden-api',
    category: 'javascript',
    number: 1,
    answer: javascriptForbiddenApi,
    status: 'SYNTAX',
    diagnosticCode: 'FORBIDDEN_API'
  },
  {
    id: 'javascript-rest-source-contract',
    category: 'javascript',
    number: 16,
    answer: javascriptRestShortcut,
    status: 'INCORRECT',
    diagnosticCode: 'SOURCE_CONTRACT'
  },
  {
    id: 'javascript-input-mutation',
    category: 'javascript',
    number: 19,
    answer: javascriptMutatesInput,
    status: 'INCORRECT',
    diagnosticCode: 'TEST_FAILURE'
  },
  {
    id: 'javascript-identical-result-object',
    category: 'javascript',
    number: 24,
    answer: javascriptReturnsInputObject,
    status: 'INCORRECT',
    diagnosticCode: 'TEST_FAILURE'
  },
  {
    id: 'javascript-runtime-error',
    category: 'javascript',
    number: 1,
    answer: javascriptRuntimeError,
    status: 'INCORRECT',
    diagnosticCode: 'RUNTIME_ERROR'
  },
  {
    id: 'javascript-time-limit',
    category: 'javascript',
    number: 1,
    answer: javascriptInfiniteLoop,
    status: 'INCORRECT',
    diagnosticCode: 'TIME_LIMIT'
  }
]

function learnerKey(label) {
  const normalized = label.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 46)
  return `grading-${runId}-${normalized}`.slice(0, 100)
}

async function requestJson(path, init = {}) {
  const response = await fetch(`${apiRoot}${path}`, {
    ...init,
    signal: AbortSignal.timeout(requestTimeoutMs)
  })
  const text = await response.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw new Error(`${init.method ?? 'GET'} ${path}: JSON이 아닌 응답(${response.status}) ${text.slice(0, 300)}`)
  }
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path}: HTTP ${response.status} ${JSON.stringify(body)}`)
  }
  return body
}

async function assertApiReady() {
  const health = await requestJson('/api/health')
  assert(health?.status === 'UP', `API readiness가 UP이 아닙니다: ${JSON.stringify(health)}`)
}

async function progress(key) {
  const result = await requestJson(`/api/progress/${encodeURIComponent(key)}`)
  assert(result.learnerKey === key, `progress learnerKey 불일치: ${JSON.stringify(result)}`)
  assert(Number.isInteger(result.attempts), `progress attempts가 정수가 아닙니다: ${JSON.stringify(result)}`)
  assert(Number.isInteger(result.solved), `progress solved가 정수가 아닙니다: ${JSON.stringify(result)}`)
  assert(Array.isArray(result.solvedProblemIds), `progress solvedProblemIds가 배열이 아닙니다: ${JSON.stringify(result)}`)
  return result
}

async function publicProblem(category, number) {
  const result = await requestJson(
    `/api/problems/${encodeURIComponent(category)}/${number}`)
  assert(result.category === category && result.number === number,
    `공개 문제 식별자가 요청과 다릅니다: ${JSON.stringify(result)}`)
  for (const privateField of [
    'answer', 'required', 'validationJson', 'solution', 'expectedAnswer'
  ]) {
    assert(!Object.hasOwn(result, privateField),
      `${category}#${number}: 공개 문제 API에 ${privateField} 필드가 노출됐습니다.`)
  }
  if (category === 'selector') {
    assert(!result.html.includes('data-target'),
      `${category}#${number}: 내부 selector target 표식이 노출됐습니다.`)
  }
  return result
}

async function submit(category, number, key, answer) {
  return requestJson(
    `/api/problems/${encodeURIComponent(category)}/${number}/submissions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ learnerKey: key, answer })
    }
  )
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertNoAnswerLeak(result, label) {
  assert(!Object.hasOwn(result, 'expectedAnswer'), `${label}: expectedAnswer 필드가 노출됐습니다.`)
  if (result.correct) {
    assert(result.solution && typeof result.solution.summary === 'string',
      `${label}: 정답 응답에 solution 해설이 없습니다.`)
  } else {
    assert(!Object.hasOwn(result, 'solution'),
      `${label}: 미정답 응답에 solution이 노출됐습니다.`)
  }
}

function assertSubmission(result, expected, label) {
  assert(result.status === expected.status,
    `${label}: status 예상 ${expected.status}, 실제 ${result.status}`)
  assert(result.diagnosticCode === expected.diagnosticCode,
    `${label}: diagnosticCode 예상 ${expected.diagnosticCode}, 실제 ${result.diagnosticCode}`)
  assert(result.correct === (expected.status === 'CORRECT'),
    `${label}: correct 값이 status와 일치하지 않습니다.`)
  assert(result.firstSolve === (expected.status === 'CORRECT'),
    `${label}: 고유 learner의 firstSolve 값이 올바르지 않습니다.`)
  assert(typeof result.intentExplanation === 'string' && result.intentExplanation.startsWith('출제 의도:'),
    `${label}: 출제 의도 설명이 없습니다.`)
  assert(typeof result.guidance === 'string' && result.guidance.length > 0,
    `${label}: 채점 guidance가 없습니다.`)
  assertNoAnswerLeak(result, label)
}

function expectedAttemptDelta(status) {
  return status === 'CORRECT' || status === 'INCORRECT' ? 1 : 0
}

async function runOneCase(testCase, index, problem) {
  const key = learnerKey(`${index}-${testCase.id}`)
  const before = await progress(key)
  assert(before.attempts === 0 && before.solved === 0 && before.solvedProblemIds.length === 0,
    `${testCase.id}: 새 learner의 시작 progress가 비어 있지 않습니다.`)

  const result = await submit(
    testCase.category, testCase.number, key, testCase.answer)
  assertSubmission(result, testCase, testCase.id)

  const after = await progress(key)
  const attemptDelta = expectedAttemptDelta(testCase.status)
  const solvedDelta = testCase.status === 'CORRECT' ? 1 : 0
  assert(after.attempts - before.attempts === attemptDelta,
    `${testCase.id}: attempts 증분 예상 ${attemptDelta}, 실제 ${after.attempts - before.attempts}`)
  assert(after.solved - before.solved === solvedDelta,
    `${testCase.id}: solved 증분 예상 ${solvedDelta}, 실제 ${after.solved - before.solved}`)
  assert(after.solvedProblemIds.length === solvedDelta,
    `${testCase.id}: solvedProblemIds 길이가 solved 상태와 다릅니다.`)
  if (solvedDelta === 1) {
    assert(after.solvedProblemIds[0] === problem.id,
      `${testCase.id}: 해결한 문제 id가 공개 문제 id와 다릅니다.`)
  }
}

async function runCases() {
  const failures = []
  const publicProblems = new Map()
  for (const testCase of gradingCases) {
    const problemKey = `${testCase.category}#${testCase.number}`
    if (!publicProblems.has(problemKey)) {
      publicProblems.set(problemKey,
        await publicProblem(testCase.category, testCase.number))
    }
  }
  for (const [index, testCase] of gradingCases.entries()) {
    try {
      const problem = publicProblems.get(`${testCase.category}#${testCase.number}`)
      await runOneCase(testCase, index, problem)
      console.log(`[${index + 1}/${gradingCases.length}] ${testCase.id} 통과`)
    } catch (error) {
      failures.push({
        case: testCase.id,
        error: error instanceof Error ? error.message : String(error)
      })
      console.error(`[${index + 1}/${gradingCases.length}] ${testCase.id} 실패`)
    }
  }
  if (failures.length > 0) {
    throw new Error(`채점 계약 ${failures.length}개 실패\n${JSON.stringify(failures, null, 2)}`)
  }
  console.log(`정상 채점 계약 ${gradingCases.length}개를 모두 검증했습니다.`)
}

async function runConcurrency() {
  const key = learnerKey('concurrency')
  const initial = await progress(key)
  assert(initial.attempts === 0 && initial.solved === 0,
    `동시성 learner의 시작 progress가 비어 있지 않습니다: ${JSON.stringify(initial)}`)

  const wrongResults = await Promise.all(Array.from({ length: 24 }, () =>
    submit('selector', 1, key, 'h2')))
  for (const [index, result] of wrongResults.entries()) {
    assert(result.status === 'INCORRECT' && result.diagnosticCode === 'SELECTOR_MISMATCH',
      `동시 오답 ${index + 1}: ${result.status}/${result.diagnosticCode}`)
    assert(result.firstSolve === false, `동시 오답 ${index + 1}: firstSolve가 true입니다.`)
    assertNoAnswerLeak(result, `동시 오답 ${index + 1}`)
  }
  const afterWrong = await progress(key)
  assert(afterWrong.attempts === 24 && afterWrong.solved === 0,
    `24개 동시 오답 이후 progress 불일치: ${JSON.stringify(afterWrong)}`)

  const correctResults = await Promise.all(Array.from({ length: 24 }, () =>
    submit('selector', 1, key, 'main > p')))
  for (const [index, result] of correctResults.entries()) {
    assert(result.status === 'CORRECT' && result.diagnosticCode === 'NONE',
      `동시 정답 ${index + 1}: ${result.status}/${result.diagnosticCode}`)
    assertNoAnswerLeak(result, `동시 정답 ${index + 1}`)
  }
  const firstSolveCount = correctResults.filter(result => result.firstSolve).length
  assert(firstSolveCount === 1,
    `24개 동시 정답에서 firstSolve=true가 ${firstSolveCount}개입니다.`)

  const final = await progress(key)
  assert(final.attempts === 48, `동시 제출 최종 attempts 예상 48, 실제 ${final.attempts}`)
  assert(final.solved === 1, `동시 제출 최종 solved 예상 1, 실제 ${final.solved}`)
  assert(final.solvedProblemIds.length === 1,
    `동시 제출 최종 solvedProblemIds 예상 1개, 실제 ${final.solvedProblemIds.length}개`)
  console.log('동시 오답 24개 + 정답 24개의 원자적 진도 기록을 검증했습니다.')
}

async function runRendererOutage() {
  const key = learnerKey('renderer-outage')
  const before = await progress(key)
  assert(before.attempts === 0 && before.solved === 0,
    `renderer 장애 learner의 시작 progress가 비어 있지 않습니다: ${JSON.stringify(before)}`)

  const result = await submit('property', 1, key, 'color: red;')
  assert(result.status === 'ERROR',
    `renderer 장애 status 예상 ERROR, 실제 ${result.status}`)
  assert(result.diagnosticCode === 'JUDGE_UNAVAILABLE',
    `renderer 장애 diagnostic 예상 JUDGE_UNAVAILABLE, 실제 ${result.diagnosticCode}`)
  assert(result.correct === false && result.firstSolve === false,
    'renderer 장애 응답이 정답 또는 firstSolve로 처리됐습니다.')
  assertNoAnswerLeak(result, 'renderer 장애')

  const after = await progress(key)
  assert(after.attempts === 0 && after.solved === 0 && after.solvedProblemIds.length === 0,
    `renderer 장애 제출이 progress에 기록됐습니다: ${JSON.stringify(after)}`)
  console.log('renderer 장애가 ERROR/JUDGE_UNAVAILABLE이며 시도 횟수에 반영되지 않음을 검증했습니다.')
}

async function runJavaScriptRunnerOutage() {
  const key = learnerKey('javascript-runner-outage')
  const before = await progress(key)
  assert(before.attempts === 0 && before.solved === 0,
    `JavaScript runner 장애 learner의 시작 progress가 비어 있지 않습니다: ${JSON.stringify(before)}`)

  const result = await submit('javascript', 1, key, javascriptAlternative)
  assert(result.status === 'ERROR',
    `JavaScript runner 장애 status 예상 ERROR, 실제 ${result.status}`)
  assert(result.diagnosticCode === 'JUDGE_UNAVAILABLE',
    `JavaScript runner 장애 diagnostic 예상 JUDGE_UNAVAILABLE, 실제 ${result.diagnosticCode}`)
  assert(result.correct === false && result.firstSolve === false,
    'JavaScript runner 장애 응답이 정답 또는 firstSolve로 처리됐습니다.')
  assertNoAnswerLeak(result, 'JavaScript runner 장애')

  const after = await progress(key)
  assert(after.attempts === 0 && after.solved === 0 && after.solvedProblemIds.length === 0,
    `JavaScript runner 장애 제출이 progress에 기록됐습니다: ${JSON.stringify(after)}`)
  console.log('JavaScript runner 장애가 ERROR/JUDGE_UNAVAILABLE이며 시도 횟수에 반영되지 않음을 검증했습니다.')
}

try {
  await assertApiReady()
  if (mode === 'cases') await runCases()
  if (mode === 'concurrency') await runConcurrency()
  if (mode === 'renderer-outage') await runRendererOutage()
  if (mode === 'javascript-runner-outage') await runJavaScriptRunnerOutage()
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
}
