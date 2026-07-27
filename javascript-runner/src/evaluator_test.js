import {
  evaluateJavaScript,
  evaluateSourceContract,
  isForbiddenSource,
  validateEvaluationRequest
} from './evaluator.js'

function request(source, tests = [
  {
    id: 'public',
    visibility: 'PUBLIC',
    number: 1,
    label: '공개 예제',
    input: 'values = [1, 2, 3]',
    arguments: [[1, 2, 3]],
    expected: 6
  },
  {
    id: 'hidden',
    visibility: 'HIDDEN',
    number: 1,
    label: '빈 배열',
    input: '',
    arguments: [[]],
    expected: 0
  }
]) {
  return { source, functionName: 'solve', tests }
}

Deno.test('기준 구현과 다른 reduce 풀이도 모든 테스트를 통과한다', async () => {
  const result = await evaluateJavaScript(request(
    'function solve(values) { return values.reduce((sum, value) => sum + value, 0); }'
  ))
  if (result.status !== 'PASSED' || result.testReport?.passed !== 2) {
    throw new Error(JSON.stringify(result))
  }
})

Deno.test('경계값을 놓친 구현은 테스트 실패로 구분한다', async () => {
  const result = await evaluateJavaScript(request(
    'function solve(values) { let sum; for (const value of values) sum = (sum ?? 0) + value; return sum; }'
  ))
  if (result.status !== 'TEST_FAILED' || result.testReport?.hiddenPassed !== 0) {
    throw new Error(JSON.stringify(result))
  }
})

Deno.test('구문 오류는 답안 줄 번호와 함께 분류한다', async () => {
  const result = await evaluateJavaScript(request(
    'function solve(values) {\n  return values.reduce((a, b) => a + b, 0;\n}'
  ))
  if (result.status !== 'COMPILE_ERROR' || result.errorLine !== 2) {
    throw new Error(JSON.stringify(result))
  }
})

Deno.test('무한 반복은 실행 제한 시간으로 종료한다', async () => {
  const result = await evaluateJavaScript(request(
    'function solve() { while (true) {} }',
    [{
      id: 'loop',
      visibility: 'HIDDEN',
      number: 1,
      label: '무한 반복 차단',
      input: '',
      arguments: [],
      expected: 0
    }]
  ))
  if (result.status !== 'TIME_LIMIT') throw new Error(JSON.stringify(result))
})

Deno.test('민감 API와 유니코드 우회 문자열을 거부한다', () => {
  const forbidden = [
    'function solve() { return Deno.readTextFileSync("/etc/passwd"); }',
    'function solve() { return fetch("http://backend:8080"); }',
    'function solve() { return globalThis["\\u0044eno"]; }',
    'function solve() { return process.env; }'
  ]
  for (const source of forbidden) {
    if (!isForbiddenSource(source)) throw new Error(`허용된 위험 코드: ${source}`)
  }
})

Deno.test('중복 테스트 id와 잘못된 함수 이름을 거부한다', () => {
  const invalid = request('function solve() { return 0; }')
  invalid.functionName = 'solve()'
  let rejected = false
  try {
    validateEvaluationRequest(invalid)
  } catch (error) {
    rejected = error instanceof TypeError
  }
  if (!rejected) throw new Error('잘못된 함수 이름을 허용했습니다.')
})

Deno.test('학습 목표가 문법 구조인 문제는 소스 계약을 검사한다', () => {
  const cases = [
    [
      'function-declaration-helper',
      'function solve(n) { function double(v) { return v * 2; } return double(n); }',
      'function solve(n) { return n * 2; }'
    ],
    [
      'arrow-function-helper',
      'function solve(text) { const clean = value => value.trim(); return clean(text); }',
      'function solve(text) { return text.trim(); }'
    ],
    [
      'rest-parameter',
      'function solve(...values) { return values.length; }',
      'function solve(a, b) { return [a, b].length; }'
    ],
    [
      'closure-counter',
      'function solve(n) { function counter(v) { return change => v += change; } return counter(n)(1); }',
      'function solve(n) { return n + 1; }'
    ],
    [
      'class-instance',
      'function solve(n) { class Box { constructor(v) { this.v = v; } } return new Box(n).v; }',
      'function solve(n) { return { value: n }.value; }'
    ],
    [
      'promise-chain',
      'function solve(n) { return Promise.resolve(n).then(value => value * 2); }',
      'async function solve(n) { return n * 2; }'
    ],
    [
      'async-promise-all',
      'async function solve(values) { return await Promise.all(values.map(async value => value * 2)); }',
      'function solve(values) { return values.map(value => value * 2); }'
    ]
  ]

  for (const [contract, accepted, rejected] of cases) {
    if (evaluateSourceContract(accepted, contract) !== null) {
      throw new Error(`${contract} 기준 코드를 거부했습니다.`)
    }
    if (!evaluateSourceContract(rejected, contract)) {
      throw new Error(`${contract} 우회 코드를 허용했습니다.`)
    }
  }
})

Deno.test('AST 소스 계약은 실제 반환값에 기여한 구문만 인정한다', () => {
  const rejected = [
    [
      'function-declaration-helper',
      'function unused(v) { return v * 2; } function solve(n) { return n * 2; }'
    ],
    [
      'arrow-function-helper',
      'function solve(text) { const unused = value => value.trim(); return text.trim(); }'
    ],
    [
      'closure-counter',
      'function unused(v) { return change => v + change; } function solve(n) { return n + 1; }'
    ],
    [
      'class-instance',
      'class Unused { constructor(v) { this.v = v; } } function Box(v) { this.v = v; } function solve(n) { return new Box(n).v; }'
    ],
    [
      'promise-chain',
      'function solve(n) { Promise.resolve(n).then(value => value * 2); return n * 2; }'
    ],
    [
      'async-promise-all',
      'async function solve(values) { Promise.all(values.map(async value => value * 2)); return values.map(value => value * 2); }'
    ]
  ]
  for (const [contract, source] of rejected) {
    if (!evaluateSourceContract(source, contract)) {
      throw new Error(`${contract}의 사용되지 않은 구문을 허용했습니다.`)
    }
  }

  const accepted = [
    [
      'function-declaration-helper',
      'function solve(n) { function 두배(v) { return v * 2; } return 두배(n); }'
    ],
    [
      'arrow-function-helper',
      'function solve(text) { const 정리 = value => value.trim(); return 정리(text); }'
    ],
    [
      'rest-parameter',
      'const solve = (...값들) => 값들.length;'
    ],
    [
      'closure-counter',
      'const 만들기 = start => { let value = start; return delta => value += delta; }; const solve = n => { const 증가 = 만들기(n); return 증가(1); };'
    ],
    [
      'class-instance',
      'function solve(n) { const 상자 = class { constructor(v) { this.v = v; } }; const item = new 상자(n); return item.v; }'
    ],
    [
      'promise-chain',
      'function solve(n) { const task = Promise.resolve(n).then(value => value * 2); return task; }'
    ],
    [
      'async-promise-all',
      'const solve = async values => { const tasks = values.map(async value => value * 2); return await Promise.all(tasks); };'
    ]
  ]
  for (const [contract, source] of accepted) {
    if (evaluateSourceContract(source, contract) !== null) {
      throw new Error(`${contract}의 유효한 변형을 거부했습니다.`)
    }
  }
})

Deno.test('문자열과 주석 속 구문은 소스 계약으로 인정하지 않는다', () => {
  const source = `
    // const helper = value => value * 2;
    function solve(value) {
      const text = "const helper = value => value * 2";
      return value * 2;
    }
  `
  if (!evaluateSourceContract(source, 'arrow-function-helper')) {
    throw new Error('문자열 또는 주석 속 화살표 함수를 실제 helper로 인정했습니다.')
  }
})

Deno.test('계약 문제도 문법 오류를 먼저 COMPILE_ERROR로 분류한다', async () => {
  const invalid = request('function solve(value) {\n  return value +;\n}')
  invalid.sourceContract = 'arrow-function-helper'
  const result = await evaluateJavaScript(invalid)
  if (result.status !== 'COMPILE_ERROR' || result.errorLine !== 2) {
    throw new Error(JSON.stringify(result))
  }
})

Deno.test('제출 코드가 비교용 내장 함수를 변조해도 오답을 정답으로 만들 수 없다', async () => {
  const result = await evaluateJavaScript(request(`
    function solve() {
      Object.is = () => true;
      Object.keys = () => [];
      Object.hasOwn = () => true;
      Array.isArray = () => false;
      JSON.stringify = () => "6";
      return 999;
    }
  `))
  if (result.status !== 'TEST_FAILED' || result.testReport?.passed !== 0) {
    throw new Error(JSON.stringify(result))
  }
})

Deno.test('prototype·iterator·직렬화 hook 변형이 채점 결과나 hidden 값을 바꿀 수 없다', async () => {
  const hiddenCanary = 'HIDDEN-CANARY-DO-NOT-EXPOSE'
  const result = await evaluateJavaScript(request(`
    function solve() {
      try {
        Object.defineProperty(Object.prototype, "toJSON", {
          value() {
            return { status: "PASSED", testReport: { passed: 99, total: 99 } };
          }
        });
      } catch {}
      try {
        Array.prototype[Symbol.iterator] = function* () {
          yield { expected: 999, arguments: [] };
        };
      } catch {}
      return 999;
    }
  `, [
    {
      id: 'public',
      visibility: 'PUBLIC',
      number: 1,
      label: '공개 예제',
      input: 'value = 1',
      arguments: [1],
      expected: 1
    },
    {
      id: 'hidden',
      visibility: 'HIDDEN',
      number: 1,
      label: hiddenCanary,
      input: hiddenCanary,
      arguments: [hiddenCanary],
      expected: hiddenCanary
    }
  ]))
  const rendered = JSON.stringify(result)
  if (result.status !== 'TEST_FAILED'
      || result.testReport?.passed !== 0
      || result.testReport?.total !== 2
      || rendered.includes(hiddenCanary)) {
    throw new Error(rendered)
  }
})

Deno.test('각 테스트는 새 realm에서 실행되어 제출 전역 상태를 공유하지 않는다', async () => {
  const result = await evaluateJavaScript(request(`
    let calls = 0;
    function solve() {
      calls += 1;
      return calls;
    }
  `, [
    {
      id: 'first',
      visibility: 'PUBLIC',
      number: 1,
      label: '첫 실행',
      input: '',
      arguments: [],
      expected: 1
    },
    {
      id: 'second',
      visibility: 'HIDDEN',
      number: 1,
      label: '독립 실행',
      input: '',
      arguments: [],
      expected: 1
    }
  ]))
  if (result.status !== 'PASSED' || result.testReport?.passed !== 2) {
    throw new Error(JSON.stringify(result))
  }
})

Deno.test('입력 불변성과 새 결과 객체 실행 계약을 검사한다', async () => {
  const mutation = request(
    'function solve(values) { values[1] += 1; return values; }',
    [{
      id: 'mutation',
      visibility: 'PUBLIC',
      number: 1,
      label: '입력 불변',
      input: 'values = [10, 10]',
      arguments: [[10, 10]],
      expected: [10, 11]
    }]
  )
  mutation.executionContract = {
    immutableArguments: [0],
    distinctResultFromArguments: [0]
  }
  const mutationResult = await evaluateJavaScript(mutation)
  if (mutationResult.status !== 'TEST_FAILED'
      || !mutationResult.testReport?.cases[0].error.startsWith('CONTRACT:')) {
    throw new Error(JSON.stringify(mutationResult))
  }

  const identity = request(
    'function solve(defaults, overrides) { Object.assign(defaults, overrides); return defaults; }',
    [{
      id: 'identity',
      visibility: 'PUBLIC',
      number: 1,
      label: '새 객체',
      input: '',
      arguments: [{ a: 1 }, { b: 2 }],
      expected: { a: 1, b: 2 }
    }]
  )
  identity.executionContract = {
    immutableArguments: [0, 1],
    distinctResultFromArguments: [0, 1]
  }
  const identityResult = await evaluateJavaScript(identity)
  if (identityResult.status !== 'TEST_FAILED') {
    throw new Error(JSON.stringify(identityResult))
  }
})

Deno.test('문법 진단에는 generated wrapper와 hidden literal을 포함하지 않는다', async () => {
  const hiddenCanary = 'HIDDEN-SYNTAX-CANARY'
  const invalid = request(
    'function solve(value) {\n  return value +;\n}',
    [{
      id: 'hidden',
      visibility: 'HIDDEN',
      number: 1,
      label: hiddenCanary,
      input: hiddenCanary,
      arguments: [hiddenCanary],
      expected: hiddenCanary
    }]
  )
  const result = await evaluateJavaScript(invalid)
  const rendered = JSON.stringify(result)
  if (result.status !== 'COMPILE_ERROR'
      || rendered.includes(hiddenCanary)
      || rendered.includes('QUEST_')
      || rendered.includes('__emit_')) {
    throw new Error(rendered)
  }
})
