import test from 'node:test'
import assert from 'node:assert/strict'
import { CssEvaluator } from './evaluator.js'

const evaluator = new CssEvaluator()

test.after(async () => {
  await evaluator.close()
})

test('브라우저 계산값이 같은 색상 표기를 정답으로 인정한다', async () => {
  const result = await evaluator.evaluate({
    html: '<div data-preview>색상</div>',
    expectedCss: 'color: red;',
    actualCss: 'color: #ff0000;',
    policy: 'computed'
  })

  assert.equal(result.matched, true)
  assert.equal(result.matchType, 'COMPUTED')
})

test('선언 순서가 달라도 같은 계산 결과를 정답으로 인정한다', async () => {
  const result = await evaluator.evaluate({
    html: '<div data-preview><span>첫째</span><span>둘째</span></div>',
    expectedCss: 'display: flex; gap: 12px;',
    actualCss: 'gap: 12px; display: flex;',
    policy: 'computed'
  })

  assert.equal(result.matched, true)
  assert.equal(result.matchType, 'COMPUTED')
})

test('논리 padding과 동등한 축약형을 정답으로 인정한다', async () => {
  const result = await evaluator.evaluate({
    html: '<div data-preview>카드</div>',
    expectedCss: 'padding-inline: 24px; padding-block: 16px;',
    actualCss: 'padding: 16px 24px;',
    policy: 'computed'
  })

  assert.equal(result.matched, true)
  assert.equal(result.matchType, 'COMPUTED')
})

test('inset과 동등한 네 방향 longhand를 정답으로 인정한다', async () => {
  const result = await evaluator.evaluate({
    html: '<div data-preview>오버레이</div>',
    expectedCss: 'position: fixed; inset: 0;',
    actualCss: 'position: fixed; top: 0px; right: 0; bottom: 0rem; left: 0%;',
    policy: 'computed'
  })

  assert.equal(result.matched, true)
  assert.equal(result.matchType, 'COMPUTED')
})

test('화면을 바꾸는 불필요한 선언은 거부한다', async () => {
  const result = await evaluator.evaluate({
    html: '<div data-preview>카드</div>',
    expectedCss: 'display: flex;',
    actualCss: 'display: flex; color: red;',
    policy: 'computed'
  })

  assert.equal(result.matched, false)
  assert.equal(result.computedMatch, true)
  assert.equal(result.visualMatch, false)
})

test('UI 문제에서는 기법이 달라도 같은 렌더링 결과를 인정한다', async () => {
  const html = '<div data-preview><span>모달</span></div>'
  const result = await evaluator.evaluate({
    html,
    expectedCss: 'display: grid; place-items: center; width: 400px; height: 240px;',
    actualCss: 'display: flex; justify-content: center; align-items: center; width: 400px; height: 240px;',
    policy: 'visual'
  })

  assert.equal(result.matched, true)
  assert.equal(result.matchType, 'VISUAL')
})

test('브라우저가 버리는 잘못된 속성값은 문법 오류로 분류한다', async () => {
  const result = await evaluator.evaluate({
    html: '<div data-preview>카드</div>',
    expectedCss: 'display: flex;',
    actualCss: 'display: fles;',
    policy: 'computed'
  })

  assert.equal(result.syntaxValid, false)
  assert.equal(result.matched, false)
  assert.equal(result.diagnosticCode, 'INVALID_PROPERTY_VALUE')
  assert.equal(result.diagnosticProperty, 'display')
  assert.equal(result.diagnosticValue, 'fles')
})

test('단위를 붙였을 때 유효해지는 숫자는 단위 누락으로 분류한다', async () => {
  const result = await evaluator.evaluate({
    html: '<div data-preview>카드</div>',
    expectedCss: 'width: 100px;',
    actualCss: 'width: 100;',
    policy: 'computed'
  })

  assert.equal(result.syntaxValid, false)
  assert.equal(result.diagnosticCode, 'MISSING_UNIT')
  assert.equal(result.diagnosticProperty, 'width')
  assert.equal(result.suggestedValue, '100px')
})

test('파서가 모르는 속성명은 알 수 없는 속성으로 분류한다', async () => {
  const result = await evaluator.evaluate({
    html: '<div data-preview>카드</div>',
    expectedCss: 'display: flex;',
    actualCss: 'displai: flex;',
    policy: 'computed'
  })

  assert.equal(result.syntaxValid, false)
  assert.equal(result.diagnosticCode, 'UNKNOWN_PROPERTY')
  assert.equal(result.diagnosticProperty, 'displai')
})

test('유효한 값이 목표와 다르면 값 불일치로 분류한다', async () => {
  const result = await evaluator.evaluate({
    html: '<div data-preview>카드</div>',
    expectedCss: 'width: 100px;',
    actualCss: 'width: 80px;',
    policy: 'computed'
  })

  assert.equal(result.syntaxValid, true)
  assert.equal(result.matched, false)
  assert.equal(result.diagnosticCode, 'VALUE_MISMATCH')
  assert.equal(result.diagnosticProperty, 'width')
})

test('목표 계산 스타일을 만드는 선언이 없으면 필요한 속성 누락으로 분류한다', async () => {
  const result = await evaluator.evaluate({
    html: '<div data-preview>카드</div>',
    expectedCss: 'display: flex; gap: 12px;',
    actualCss: 'display: flex;',
    policy: 'computed'
  })

  assert.equal(result.syntaxValid, true)
  assert.equal(result.matched, false)
  assert.equal(result.diagnosticCode, 'MISSING_REQUIRED_PROPERTY')
  assert.equal(result.diagnosticProperty, 'row-gap')
})

test('custom property의 닫는 중괄호로 대상 규칙을 탈출할 수 없다', async () => {
  const result = await evaluator.evaluate({
    html: '<div data-preview>카드</div>',
    expectedCss: 'color: red;',
    actualCss: '--escape: } [data-preview] { color: red; --tail: safe;',
    policy: 'computed'
  })

  assert.equal(result.syntaxValid, true)
  assert.equal(result.matched, false)
  assert.equal(result.computedMatch, false)
})

test('native textarea 계산 스타일은 픽셀 차이와 무관하게 반복해서 일치한다', async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await evaluator.evaluate({
      html: '<textarea data-preview>메모를 입력하세요.</textarea>',
      expectedCss: 'resize: vertical;',
      actualCss: 'resize: vertical;',
      policy: 'computed'
    })

    assert.equal(result.syntaxValid, true, `attempt ${attempt + 1}`)
    assert.equal(result.computedMatch, true, `attempt ${attempt + 1}`)
    assert.equal(result.matched, true, `attempt ${attempt + 1}`)
  }
})

test('과도하게 큰 렌더링 결과는 전체 페이지 캡처 전에 거부한다', async () => {
  await assert.rejects(
    evaluator.evaluate({
      html: '<div data-preview>큰 요소</div>',
      expectedCss: 'height: 100px;',
      actualCss: 'height: 100000px;',
      policy: 'computed'
    }),
    /렌더링 결과가 허용 크기/
  )
})
