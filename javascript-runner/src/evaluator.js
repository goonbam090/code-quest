import {
  evaluateSourceContract,
  evaluateSourceContractAst,
  isForbiddenAst,
  isForbiddenSource,
  parseSubmission
} from './source-contracts.js'

export { evaluateSourceContract, isForbiddenSource }

const MAX_SOURCE_LENGTH = 60_000
const MAX_TESTS = 20
const MAX_OUTPUT_BYTES = 32_000
const MAX_RESULT_NODES = 5_000
const MAX_RESULT_DEPTH = 30
const RUN_TIMEOUT_MS = 2_500
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const TEST_ID = /^[a-z0-9][a-z0-9-]*$/
const SOURCE_CONTRACTS = new Set([
  'none',
  'function-declaration-helper',
  'arrow-function-helper',
  'rest-parameter',
  'closure-counter',
  'class-instance',
  'promise-chain',
  'async-promise-all'
])
const EXECUTION_CONTRACT_KEYS = new Set([
  'immutableArguments',
  'distinctResultFromArguments'
])

function validateIndexList(value, field) {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw new TypeError(`${field}는 인자 인덱스 배열이어야 합니다.`)
  }
  const seen = new Set()
  for (let index = 0; index < value.length; index++) {
    const argumentIndex = value[index]
    if (!Number.isInteger(argumentIndex) || argumentIndex < 0 || seen.has(argumentIndex)) {
      throw new TypeError(`${field}의 인덱스는 중복되지 않은 0 이상의 정수여야 합니다.`)
    }
    seen.add(argumentIndex)
  }
  return [...value]
}

function validateExecutionContract(value, tests) {
  if (value === undefined) {
    return { immutableArguments: [], distinctResultFromArguments: [] }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('executionContract는 JSON 객체여야 합니다.')
  }
  for (const key of Object.keys(value)) {
    if (!EXECUTION_CONTRACT_KEYS.has(key)) {
      throw new TypeError(`지원하지 않는 실행 계약 필드입니다: ${key}`)
    }
  }
  const contract = {
    immutableArguments: validateIndexList(
      value.immutableArguments,
      'immutableArguments'
    ),
    distinctResultFromArguments: validateIndexList(
      value.distinctResultFromArguments,
      'distinctResultFromArguments'
    )
  }
  for (const test of tests) {
    for (const argumentIndex of [
      ...contract.immutableArguments,
      ...contract.distinctResultFromArguments
    ]) {
      if (argumentIndex >= test.arguments.length) {
        throw new TypeError('실행 계약의 인덱스가 테스트 인자 범위를 벗어났습니다.')
      }
    }
  }
  return contract
}

export function validateEvaluationRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('실행 요청은 JSON 객체여야 합니다.')
  }
  if (typeof value.source !== 'string' || value.source.length === 0
      || value.source.length > MAX_SOURCE_LENGTH) {
    throw new TypeError('JavaScript 코드 크기가 허용 범위를 벗어났습니다.')
  }
  if (typeof value.functionName !== 'string' || !IDENTIFIER.test(value.functionName)) {
    throw new TypeError('채점 함수 이름이 올바르지 않습니다.')
  }
  if (value.sourceContract !== undefined
      && (typeof value.sourceContract !== 'string'
        || !SOURCE_CONTRACTS.has(value.sourceContract))) {
    throw new TypeError('지원하지 않는 JavaScript 소스 코드 계약입니다.')
  }
  if (!Array.isArray(value.tests) || value.tests.length < 1
      || value.tests.length > MAX_TESTS) {
    throw new TypeError(`테스트는 1개 이상 ${MAX_TESTS}개 이하여야 합니다.`)
  }

  const ids = new Set()
  const caseKeys = new Set()
  for (let index = 0; index < value.tests.length; index++) {
    const test = value.tests[index]
    if (!test || typeof test !== 'object' || Array.isArray(test)) {
      throw new TypeError('각 테스트는 JSON 객체여야 합니다.')
    }
    if (typeof test.id !== 'string' || !TEST_ID.test(test.id) || ids.has(test.id)) {
      throw new TypeError('테스트 id는 비어 있지 않은 고유한 소문자 식별자여야 합니다.')
    }
    ids.add(test.id)
    if (test.visibility !== 'PUBLIC' && test.visibility !== 'HIDDEN') {
      throw new TypeError('테스트 공개 범위가 올바르지 않습니다.')
    }
    if (!Number.isInteger(test.number) || test.number < 1
        || caseKeys.has(`${test.visibility}:${test.number}`)) {
      throw new TypeError('테스트 번호는 공개 범위 안에서 고유한 양의 정수여야 합니다.')
    }
    caseKeys.add(`${test.visibility}:${test.number}`)
    if (typeof test.label !== 'string' || test.label.trim().length === 0) {
      throw new TypeError('테스트 설명이 비어 있습니다.')
    }
    if (typeof test.input !== 'string' || !Array.isArray(test.arguments)
        || !Object.hasOwn(test, 'expected')) {
      throw new TypeError('테스트 입력이나 기대값이 올바르지 않습니다.')
    }
    if (!isJsonValue(test.arguments) || !isJsonValue(test.expected)) {
      throw new TypeError('테스트 입력과 기대값은 크기가 제한된 JSON 값이어야 합니다.')
    }
  }
  value.executionContract = validateExecutionContract(
    value.executionContract,
    value.tests
  )
  return value
}

function randomIdentifier(prefix) {
  return `__${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}

function buildSingleCaseSource(request, test, protocolToken) {
  const names = {
    emit: randomIdentifier('emit'),
    stringify: randomIdentifier('stringify'),
    freeze: randomIdentifier('freeze'),
    arrayIsArray: randomIdentifier('arrayIsArray'),
    objectIs: randomIdentifier('objectIs'),
    objectKeys: randomIdentifier('objectKeys'),
    objectGetPrototypeOf: randomIdentifier('objectGetPrototypeOf'),
    objectGetOwnPropertyDescriptor: randomIdentifier('objectGetOwnPropertyDescriptor'),
    objectCreate: randomIdentifier('objectCreate'),
    numberIsFinite: randomIdentifier('numberIsFinite'),
    numberIsInteger: randomIdentifier('numberIsInteger'),
    weakSet: randomIdentifier('weakSet'),
    string: randomIdentifier('string'),
    objectPrototype: randomIdentifier('objectPrototype'),
    arrayPrototype: randomIdentifier('arrayPrototype'),
    sanitize: randomIdentifier('sanitize'),
    solve: randomIdentifier('solve'),
    args: randomIdentifier('args'),
    actual: randomIdentifier('actual'),
    safeActual: randomIdentifier('safeActual'),
    observedArguments: randomIdentifier('observedArguments'),
    identityChecks: randomIdentifier('identityChecks'),
    intrinsicPrototypes: randomIdentifier('intrinsicPrototypes')
  }
  const argumentsJson = JSON.stringify(test.arguments)
  const immutableJson = JSON.stringify(request.executionContract.immutableArguments)
  const distinctJson = JSON.stringify(
    request.executionContract.distinctResultFromArguments
  )
  const prelude = `"use strict";
const ${names.emit} = console.log.bind(console);
const ${names.stringify} = JSON.stringify.bind(JSON);
const ${names.freeze} = Object.freeze.bind(Object);
const ${names.arrayIsArray} = Array.isArray.bind(Array);
const ${names.objectIs} = Object.is.bind(Object);
const ${names.objectKeys} = Object.keys.bind(Object);
const ${names.objectGetPrototypeOf} = Object.getPrototypeOf.bind(Object);
const ${names.objectGetOwnPropertyDescriptor} = Object.getOwnPropertyDescriptor.bind(Object);
const ${names.objectCreate} = Object.create.bind(Object);
const ${names.numberIsFinite} = Number.isFinite.bind(Number);
const ${names.numberIsInteger} = Number.isInteger.bind(Number);
const ${names.weakSet} = WeakSet;
const ${names.string} = String;
const ${names.objectPrototype} = Object.prototype;
const ${names.arrayPrototype} = Array.prototype;
const ${names.intrinsicPrototypes} = [
  Object.prototype,
  Array.prototype,
  Function.prototype,
  String.prototype,
  Number.prototype,
  Boolean.prototype,
  BigInt.prototype,
  Symbol.prototype,
  RegExp.prototype,
  Date.prototype,
  Map.prototype,
  Set.prototype,
  WeakMap.prototype,
  WeakSet.prototype,
  Promise.prototype,
  Error.prototype,
  EvalError.prototype,
  RangeError.prototype,
  ReferenceError.prototype,
  SyntaxError.prototype,
  TypeError.prototype,
  URIError.prototype
];
for (let index = 0; index < ${names.intrinsicPrototypes}.length; index++) {
  ${names.freeze}(${names.intrinsicPrototypes}[index]);
}
const ${names.sanitize} = (value, seen, depth, state) => {
  state.nodes++;
  if (state.nodes > ${MAX_RESULT_NODES} || depth > ${MAX_RESULT_DEPTH}) {
    throw new TypeError("반환값이 너무 크거나 깊습니다.");
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!${names.numberIsFinite}(value)) {
      throw new TypeError("유한한 숫자만 반환할 수 있습니다.");
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError("JSON으로 표현할 수 있는 값을 반환해 주세요.");
  }
  if (seen.has(value)) throw new TypeError("순환 참조가 있는 값은 반환할 수 없습니다.");
  seen.add(value);
  if (${names.arrayIsArray}(value)) {
    if (!${names.numberIsInteger}(value.length) || value.length > ${MAX_RESULT_NODES}) {
      throw new TypeError("반환 배열이 너무 큽니다.");
    }
    const result = [];
    for (let index = 0; index < value.length; index++) {
      const descriptor = ${names.objectGetOwnPropertyDescriptor}(value, ${names.string}(index));
      if (!descriptor) {
        result[index] = null;
      } else if (!("value" in descriptor)) {
        throw new TypeError("접근자 속성은 반환할 수 없습니다.");
      } else {
        result[index] = ${names.sanitize}(descriptor.value, seen, depth + 1, state);
      }
    }
    seen.delete(value);
    return result;
  }
  const prototype = ${names.objectGetPrototypeOf}(value);
  if (prototype !== ${names.objectPrototype} && prototype !== null) {
    throw new TypeError("배열 또는 일반 객체만 반환할 수 있습니다.");
  }
  const result = ${names.objectCreate}(null);
  const keys = ${names.objectKeys}(value);
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    const descriptor = ${names.objectGetOwnPropertyDescriptor}(value, key);
    if (!descriptor || !("value" in descriptor)) {
      throw new TypeError("접근자 속성은 반환할 수 없습니다.");
    }
    result[key] = ${names.sanitize}(descriptor.value, seen, depth + 1, state);
  }
  seen.delete(value);
  return result;
};
(async () => {
  let ${names.solve};
  try {
    ${names.solve} = (() => {
`
  const suffix = `
      return typeof ${request.functionName} === "function" ? ${request.functionName} : null;
    })();
  } catch {
    ${names.emit}(${JSON.stringify(protocolToken)} + ${names.stringify}({
      kind: "PREPARATION_ERROR"
    }));
    return;
  }
  if (typeof ${names.solve} !== "function") {
    ${names.emit}(${JSON.stringify(protocolToken)} + ${names.stringify}({
      kind: "MISSING_FUNCTION"
    }));
    return;
  }

  const ${names.args} = ${argumentsJson};
  let ${names.actual};
  try {
    ${names.actual} = await ${names.solve}(...${names.args});
  } catch (error) {
    let name = "Error";
    let message = "";
    try {
      name = typeof error?.name === "string" ? error.name.slice(0, 80) : "Error";
      message = typeof error?.message === "string" ? error.message.slice(0, 300) : "";
    } catch {
      name = "Error";
      message = "";
    }
    ${names.emit}(${JSON.stringify(protocolToken)} + ${names.stringify}({
      kind: "ERROR",
      name,
      message
    }));
    return;
  }
  try {
    const ${names.safeActual} = ${names.sanitize}(
      ${names.actual},
      new ${names.weakSet}(),
      0,
      { nodes: 0 }
    );
    const ${names.observedArguments} = [];
    const immutableIndexes = ${immutableJson};
    for (let index = 0; index < immutableIndexes.length; index++) {
      const argumentIndex = immutableIndexes[index];
      ${names.observedArguments}[index] = {
        index: argumentIndex,
        value: ${names.sanitize}(
          ${names.args}[argumentIndex],
          new ${names.weakSet}(),
          0,
          { nodes: 0 }
        )
      };
    }
    const ${names.identityChecks} = [];
    const distinctIndexes = ${distinctJson};
    for (let index = 0; index < distinctIndexes.length; index++) {
      const argumentIndex = distinctIndexes[index];
      ${names.identityChecks}[index] = {
        index: argumentIndex,
        same: ${names.objectIs}(${names.actual}, ${names.args}[argumentIndex])
      };
    }
    ${names.emit}(${JSON.stringify(protocolToken)} + ${names.stringify}({
      kind: "VALUE",
      actual: ${names.safeActual},
      observedArguments: ${names.observedArguments},
      identityChecks: ${names.identityChecks}
    }));
  } catch {
    ${names.emit}(${JSON.stringify(protocolToken)} + ${names.stringify}({
      kind: "UNSUPPORTED_VALUE"
    }));
  }
})().catch(() => {
  ${names.emit}(${JSON.stringify(protocolToken)} + ${names.stringify}({
    kind: "PREPARATION_ERROR"
  }));
});
`
  return `${prelude}${request.source}${suffix}`
}

async function readStream(stream, process, state) {
  const reader = stream.getReader()
  const chunks = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      state.outputBytes += value.length
      if (state.outputBytes > MAX_OUTPUT_BYTES) {
        state.outputExceeded = true
        try {
          process.kill('SIGKILL')
        } catch {
          // 이미 종료된 프로세스는 다시 종료할 필요가 없습니다.
        }
        break
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Uint8Array(length)
  let offset = 0
  for (let index = 0; index < chunks.length; index++) {
    merged.set(chunks[index], offset)
    offset += chunks[index].length
  }
  return new TextDecoder().decode(merged)
}

function isJsonValue(value, state = { nodes: 0 }, depth = 0) {
  state.nodes++
  if (state.nodes > MAX_RESULT_NODES || depth > MAX_RESULT_DEPTH) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!isJsonValue(value[index], state, depth + 1)) return false
    }
    return true
  }
  for (const key of Object.keys(value)) {
    if (!isJsonValue(value[key], state, depth + 1)) return false
  }
  return true
}

function exactObservationIndexes(items, expectedIndexes, valueField) {
  if (!Array.isArray(items) || items.length !== expectedIndexes.length) return false
  for (let index = 0; index < expectedIndexes.length; index++) {
    const item = items[index]
    if (!item || typeof item !== 'object' || Array.isArray(item)
        || item.index !== expectedIndexes[index]
        || !Object.hasOwn(item, valueField)) {
      return false
    }
    if (valueField === 'value' && !isJsonValue(item.value)) return false
    if (valueField === 'same' && typeof item.same !== 'boolean') return false
  }
  return true
}

function parseChildPacket(stdout, protocolToken, executionContract) {
  let protocolLine = null
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith(protocolToken)) protocolLine = line
  }
  if (!protocolLine) return null
  try {
    const packet = JSON.parse(protocolLine.slice(protocolToken.length))
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)
        || typeof packet.kind !== 'string') {
      return null
    }
    if (packet.kind === 'VALUE') {
      if (!isJsonValue(packet.actual)
          || !exactObservationIndexes(
            packet.observedArguments,
            executionContract.immutableArguments,
            'value'
          )
          || !exactObservationIndexes(
            packet.identityChecks,
            executionContract.distinctResultFromArguments,
            'same'
          )) {
        return null
      }
      return packet
    }
    if (packet.kind === 'ERROR') {
      return typeof packet.name === 'string' && typeof packet.message === 'string'
        ? {
            kind: 'ERROR',
            name: packet.name.slice(0, 80),
            message: packet.message.slice(0, 300)
          }
        : null
    }
    if (packet.kind === 'MISSING_FUNCTION'
        || packet.kind === 'PREPARATION_ERROR'
        || packet.kind === 'UNSUPPORTED_VALUE') {
      return { kind: packet.kind }
    }
    return null
  } catch {
    return null
  }
}

async function runSingleCase(request, test, deadline, outputState) {
  const remaining = deadline - Date.now()
  if (remaining <= 0) return { kind: 'TIME_LIMIT' }

  const protocolToken = `QUEST_${crypto.randomUUID().replaceAll('-', '')}:`
  const source = buildSingleCaseSource(request, test, protocolToken)
  const command = new Deno.Command('/bin/deno', {
    args: [
      'run',
      '--quiet',
      '--no-prompt',
      '--deny-read',
      '--deny-write',
      '--deny-net',
      '--deny-env',
      '--deny-run',
      '--deny-sys',
      '--deny-ffi',
      '--deny-import',
      '--v8-flags=--max-old-space-size=64',
      '-'
    ],
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'piped',
    clearEnv: true,
    env: {
      DENO_NO_UPDATE_CHECK: '1',
      NO_COLOR: '1'
    }
  })

  let process
  try {
    process = command.spawn()
  } catch {
    return { kind: 'UNAVAILABLE' }
  }

  try {
    const writer = process.stdin.getWriter()
    await writer.write(new TextEncoder().encode(source))
    await writer.close()
  } catch {
    try {
      process.kill('SIGKILL')
    } catch {
      // 이미 종료된 프로세스는 다시 종료할 필요가 없습니다.
    }
    return { kind: 'UNAVAILABLE' }
  }

  const stdoutPromise = readStream(process.stdout, process, outputState)
  const stderrPromise = readStream(process.stderr, process, outputState)
  const statusPromise = process.status
  let timeoutId
  const timeout = new Promise(resolve => {
    timeoutId = setTimeout(() => {
      try {
        process.kill('SIGKILL')
      } catch {
        // 이미 종료된 프로세스는 다시 종료할 필요가 없습니다.
      }
      resolve(null)
    }, Math.max(1, deadline - Date.now()))
  })
  const childStatus = await Promise.race([statusPromise, timeout])
  clearTimeout(timeoutId)
  if (childStatus === null) await statusPromise
  const [stdout] = await Promise.all([stdoutPromise, stderrPromise])

  if (childStatus === null) return { kind: 'TIME_LIMIT' }
  if (outputState.outputExceeded) return { kind: 'OUTPUT_LIMIT' }
  return parseChildPacket(stdout, protocolToken, request.executionContract)
    ?? { kind: 'RUNTIME_FAILURE' }
}

function deepEqual(left, right) {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false
    }
    for (let index = 0; index < left.length; index++) {
      if (!deepEqual(left[index], right[index])) return false
    }
    return true
  }
  if (left === null || right === null
      || typeof left !== 'object' || typeof right !== 'object') {
    return false
  }
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  for (const key of leftKeys) {
    if (!Object.hasOwn(right, key) || !deepEqual(left[key], right[key])) return false
  }
  return true
}

function render(value) {
  try {
    const rendered = JSON.stringify(value)
    return rendered === undefined ? String(value) : rendered
  } catch {
    return '[직렬화할 수 없는 값]'
  }
}

function executionContractFailure(packet, test, contract) {
  for (let index = 0; index < contract.immutableArguments.length; index++) {
    const argumentIndex = contract.immutableArguments[index]
    if (!deepEqual(packet.observedArguments[index].value, test.arguments[argumentIndex])) {
      return `입력 ${argumentIndex + 1}번째 값을 변경하지 않고 처리해야 합니다.`
    }
  }
  for (let index = 0; index < contract.distinctResultFromArguments.length; index++) {
    if (packet.identityChecks[index].same) {
      return '입력 객체를 그대로 반환하지 말고 새 결과를 만들어 반환해야 합니다.'
    }
  }
  return null
}

function compileError(error) {
  const errorLine = Number.isInteger(error?.loc?.line) && error.loc.line > 0
    ? error.loc.line
    : null
  return {
    status: 'COMPILE_ERROR',
    details: errorLine === null
      ? 'JavaScript 문법을 해석하지 못했습니다.'
      : `${errorLine}번째 줄 근처의 괄호·쉼표·연산자 문법을 확인해 주세요.`,
    errorLine,
    testReport: null
  }
}

export async function evaluateJavaScript(request) {
  validateEvaluationRequest(request)

  let ast
  try {
    ast = parseSubmission(request.source)
  } catch (error) {
    return compileError(error)
  }
  if (isForbiddenAst(ast, request.source)) {
    return {
      status: 'FORBIDDEN_API',
      details: '파일·네트워크·프로세스 또는 동적 코드 실행 API는 사용할 수 없습니다.',
      errorLine: null,
      testReport: null
    }
  }
  const sourceContractFailure = evaluateSourceContractAst(
    ast,
    request.sourceContract ?? 'none'
  )
  if (sourceContractFailure) {
    return {
      status: 'SOURCE_CONTRACT_FAILED',
      details: sourceContractFailure,
      errorLine: null,
      testReport: null
    }
  }

  const deadline = Date.now() + RUN_TIMEOUT_MS
  const outputState = { outputBytes: 0, outputExceeded: false }
  const cases = []
  let passed = 0
  let publicPassed = 0
  let publicTotal = 0
  let hiddenPassed = 0
  let hiddenTotal = 0
  let runtimeError = false

  for (let index = 0; index < request.tests.length; index++) {
    const test = request.tests[index]
    if (test.visibility === 'PUBLIC') publicTotal++
    else hiddenTotal++

    const packet = await runSingleCase(request, test, deadline, outputState)
    if (packet.kind === 'TIME_LIMIT') {
      return {
        status: 'TIME_LIMIT',
        details: '코드 실행이 전체 2.5초 제한을 초과했습니다.',
        errorLine: null,
        testReport: null
      }
    }
    if (packet.kind === 'OUTPUT_LIMIT') {
      return {
        status: 'RUNTIME_ERROR',
        details: '코드 출력이 전체 32KB 제한을 초과했습니다.',
        errorLine: null,
        testReport: null
      }
    }
    if (packet.kind === 'UNAVAILABLE') {
      return {
        status: 'UNAVAILABLE',
        details: 'JavaScript 실행 프로세스를 시작하지 못했습니다.',
        errorLine: null,
        testReport: null
      }
    }
    if (packet.kind === 'MISSING_FUNCTION') {
      return {
        status: 'COMPILE_ERROR',
        details: `\`${request.functionName}\` 함수를 찾을 수 없습니다.`,
        errorLine: null,
        testReport: null
      }
    }

    const visible = test.visibility === 'PUBLIC'
    let matched = false
    let actual = ''
    let error = ''
    if (packet.kind === 'VALUE') {
      const contractFailure = executionContractFailure(
        packet,
        test,
        request.executionContract
      )
      matched = contractFailure === null && deepEqual(test.expected, packet.actual)
      actual = visible ? render(packet.actual) : ''
      if (contractFailure && visible) error = `CONTRACT: ${contractFailure}`
    } else if (packet.kind === 'UNSUPPORTED_VALUE') {
      actual = visible ? '[JSON으로 표현할 수 없는 반환값]' : ''
    } else {
      runtimeError = true
      if (visible) {
        error = packet.kind === 'ERROR'
          ? `${packet.name}${packet.message ? `: ${packet.message}` : ''}`
          : 'JavaScript 실행 프로세스가 비정상 종료되었습니다.'
      }
    }

    if (matched) {
      passed++
      if (visible) publicPassed++
      else hiddenPassed++
    }
    cases.push({
      id: test.id,
      visibility: test.visibility,
      number: test.number,
      label: visible ? test.label : `비공개 테스트 ${test.number}`,
      input: visible ? test.input : '',
      expected: visible ? render(test.expected) : '',
      actual,
      error,
      passed: matched
    })
  }

  const total = request.tests.length
  const status = runtimeError ? 'RUNTIME_ERROR' : passed === total
    ? 'PASSED'
    : 'TEST_FAILED'
  return {
    status,
    details: status === 'PASSED'
      ? 'JavaScript 실행과 모든 테스트를 통과했습니다.'
      : status === 'RUNTIME_ERROR'
        ? '코드 실행 중 예외가 발생했습니다.'
        : `${passed}/${total} 테스트를 통과했습니다.`,
    errorLine: null,
    testReport: {
      passed,
      total,
      publicPassed,
      publicTotal,
      hiddenPassed,
      hiddenTotal,
      cases
    }
  }
}
