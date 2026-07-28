import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
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

test('transition 시간과 easing은 안정화 CSS를 적용하기 전에 비교한다', async () => {
  const wrongDuration = await evaluator.evaluate({
    html: '<div data-preview>카드</div>',
    expectedCss: 'transition: transform 200ms ease, opacity 200ms ease;',
    actualCss: 'transition: transform 999ms ease, opacity 999ms ease;',
    policy: 'computed'
  })
  const missingDuration = await evaluator.evaluate({
    html: '<div data-preview>카드</div>',
    expectedCss: 'transition: transform 200ms ease, opacity 200ms ease;',
    actualCss: 'transition-property: transform, opacity; transition-timing-function: ease, ease;',
    policy: 'computed'
  })
  const equivalentLonghands = await evaluator.evaluate({
    html: '<div data-preview>카드</div>',
    expectedCss: 'transition: transform 200ms ease, opacity 200ms ease;',
    actualCss: 'transition-property: transform, opacity; transition-duration: 200ms, 200ms; transition-timing-function: ease, ease;',
    policy: 'computed'
  })

  assert.equal(wrongDuration.matched, false)
  assert.equal(missingDuration.matched, false)
  assert.equal(equivalentLonghands.matched, true)
})

test('animation 이름·시간·반복 계약은 안정화 CSS를 적용하기 전에 비교한다', async () => {
  const html = '<style>@keyframes spin-loop { to { transform: rotate(360deg); } }</style><div data-preview>로더</div>'
  const wrongDuration = await evaluator.evaluate({
    html,
    expectedCss: 'animation: spin-loop 800ms linear infinite;',
    actualCss: 'animation: spin-loop 1ms linear infinite;',
    policy: 'computed'
  })
  const missingDuration = await evaluator.evaluate({
    html,
    expectedCss: 'animation: spin-loop 800ms linear infinite;',
    actualCss: 'animation-name: spin-loop; animation-timing-function: linear; animation-iteration-count: infinite;',
    policy: 'computed'
  })
  const equivalentLonghands = await evaluator.evaluate({
    html,
    expectedCss: 'animation: spin-loop 800ms linear infinite;',
    actualCss: 'animation-name: spin-loop; animation-duration: 800ms; animation-timing-function: linear; animation-iteration-count: infinite;',
    policy: 'computed'
  })

  assert.equal(wrongDuration.matched, false)
  assert.equal(missingDuration.matched, false)
  assert.equal(equivalentLonghands.matched, true)
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
  const result = await evaluator.evaluate({
    html: '<div data-preview>큰 요소</div>',
    expectedCss: 'height: 100px;',
    actualCss: 'height: 100000px;',
    policy: 'computed'
  })

  assert.equal(result.syntaxValid, false)
  assert.equal(result.matched, false)
  assert.equal(result.diagnosticCode, 'RENDER_LIMIT')
})

test('전체 stylesheet가 같은 화면과 배치를 만들면 구현 방식이 달라도 인정한다', async () => {
  const result = await evaluator.evaluate({
    mode: 'stylesheet',
    html: '<main class="cards"><article>첫째</article><article>둘째</article></main>',
    expectedCss: `
      .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .cards > article { padding: 8px; }
    `,
    actualCss: `
      .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      article { padding: 8px; }
    `
  })

  assert.equal(result.syntaxValid, true)
  assert.equal(result.matched, true)
  assert.equal(result.matchType, 'VISUAL')
})

test('전체 stylesheet의 viewport는 body 기본 여백 없이 화면 전체를 기준으로 계산한다', async () => {
  const result = await evaluator.evaluate({
    mode: 'stylesheet',
    html: '<main class="shell">읽기 영역</main>',
    expectedCss: '.shell { width: min(calc(100% - 32px), 1120px); margin-inline: auto; }',
    actualCss: '.shell { width: 358px; margin-inline: auto; }',
    validation: { viewports: [{ width: 390, height: 780 }] }
  })

  assert.equal(result.syntaxValid, true)
  assert.equal(result.matched, true)
})

test('브라우저가 적용할 선언이 없는 잘못된 stylesheet를 문법 오류로 분류한다', async () => {
  const result = await evaluator.evaluate({
    mode: 'stylesheet',
    html: '<article class="card">카드</article>',
    expectedCss: '.card { color: red; }',
    actualCss: '.card { color red; }'
  })

  assert.equal(result.syntaxValid, false)
  assert.equal(result.matched, false)
  assert.equal(result.diagnosticCode, 'MALFORMED_DECLARATION')
})

test('정상 규칙 뒤에 섞인 잘못된 속성명도 문법 오류로 분류한다', async () => {
  const result = await evaluator.evaluate({
    mode: 'stylesheet',
    html: '<article class="card">카드</article>',
    expectedCss: '.card { color: red; }',
    actualCss: '.card { color: red; colr: blue; }'
  })

  assert.equal(result.syntaxValid, false)
  assert.equal(result.matched, false)
  assert.equal(result.diagnosticCode, 'UNKNOWN_PROPERTY')
  assert.equal(result.diagnosticProperty, 'colr')
})

test('전체 stylesheet도 잘못된 값과 단위 누락을 구분한다', async () => {
  const invalidValue = await evaluator.evaluate({
    mode: 'stylesheet',
    html: '<article class="card">카드</article>',
    expectedCss: '.card { display: flex; width: 100px; }',
    actualCss: '.card { display: fles; width: 100px; }'
  })
  const missingUnit = await evaluator.evaluate({
    mode: 'stylesheet',
    html: '<article class="card">카드</article>',
    expectedCss: '.card { display: flex; width: 100px; }',
    actualCss: '.card { display: flex; width: 100; }'
  })

  assert.equal(invalidValue.syntaxValid, false)
  assert.equal(invalidValue.diagnosticCode, 'INVALID_PROPERTY_VALUE')
  assert.equal(invalidValue.diagnosticProperty, 'display')
  assert.equal(missingUnit.syntaxValid, false)
  assert.equal(missingUnit.diagnosticCode, 'MISSING_UNIT')
  assert.equal(missingUnit.diagnosticProperty, 'width')
  assert.equal(missingUnit.suggestedValue, '100px')
})

test('정상 규칙과 함께 추가한 잘못된 선택자도 문법 오류로 분류한다', async () => {
  const result = await evaluator.evaluate({
    mode: 'stylesheet',
    html: '<article class="card">카드</article>',
    expectedCss: '.card { color: red; }',
    actualCss: '.card { color: red; } .card:??? { color: blue; }'
  })

  assert.equal(result.syntaxValid, false)
  assert.equal(result.matched, false)
  assert.equal(result.diagnosticCode, 'MALFORMED_DECLARATION')
})

test('정상 규칙과 함께 작성된 data import도 거부한다', async () => {
  const result = await evaluator.evaluate({
    mode: 'stylesheet',
    html: '<article class="card">카드</article>',
    expectedCss: '.card { color: red; }',
    actualCss: '@import url("data:text/css,.card%7Bcolor:red%7D"); .card { color: red; }'
  })

  assert.equal(result.syntaxValid, false)
  assert.equal(result.matched, false)
  assert.equal(result.diagnosticCode, 'MALFORMED_DECLARATION')
})

test('전체 stylesheet의 외부 URL은 사용 여부와 관계없이 거부한다', async () => {
  const result = await evaluator.evaluate({
    mode: 'stylesheet',
    html: '<article class="card">카드</article>',
    expectedCss: '.card { color: red; }',
    actualCss: '.card { color: red; } .unused { background-image: url("https://example.com/track.png"); }'
  })

  assert.equal(result.syntaxValid, false)
  assert.equal(result.matched, false)
  assert.equal(result.diagnosticCode, 'FORBIDDEN_RESOURCE')
})

test('닫히지 않은 stylesheet 중괄호를 브라우저 보정 전에 문법 오류로 분류한다', async () => {
  const result = await evaluator.evaluate({
    mode: 'stylesheet',
    html: '<article class="card">카드</article>',
    expectedCss: '.card { color: red; }',
    actualCss: '.card { color: red;'
  })

  assert.equal(result.syntaxValid, false)
  assert.equal(result.matched, false)
  assert.equal(result.diagnosticCode, 'MALFORMED_DECLARATION')
})

test('validation의 모든 viewport에서 반응형 결과를 비교한다', async () => {
  const result = await evaluator.evaluate({
    mode: 'stylesheet',
    html: '<main class="cards"><article>첫째</article><article>둘째</article></main>',
    expectedCss: `
      .cards { display: grid; grid-template-columns: repeat(2, 1fr); }
      @media (max-width: 500px) { .cards { grid-template-columns: 1fr; } }
    `,
    actualCss: '.cards { display: grid; grid-template-columns: repeat(2, 1fr); }',
    validation: {
      viewports: [
        { width: 800, height: 600 },
        { width: 400, height: 600 }
      ]
    }
  })

  assert.equal(result.syntaxValid, true)
  assert.equal(result.matched, false)
  assert.equal(result.diagnosticCode, 'RESULT_MISMATCH')
})

test('hover selector 시나리오의 상태 화면을 비교한다', async () => {
  const result = await evaluator.evaluate({
    mode: 'stylesheet',
    html: '<button class="action">저장</button>',
    expectedCss: '.action:hover { background: rgb(180, 20, 60); }',
    actualCss: '.action { color: rgb(238, 238, 238); }',
    validation: { hover: ['.action'] }
  })

  assert.equal(result.syntaxValid, true)
  assert.equal(result.matched, false)
  assert.equal(result.diagnosticCode, 'RESULT_MISMATCH')
})

test('focus selector 시나리오에서 focus-visible 상태 화면을 비교한다', async () => {
  const result = await evaluator.evaluate({
    mode: 'stylesheet',
    html: '<button class="field">저장</button>',
    expectedCss: '.field:focus-visible { outline: 4px solid rgb(120, 90, 240); }',
    actualCss: '.field { color: rgb(238, 238, 238); }',
    validation: { focus: ['.field'] }
  })

  assert.equal(result.syntaxValid, true)
  assert.equal(result.matched, false)
  assert.equal(result.diagnosticCode, 'RESULT_MISMATCH')
})

test('viewport와 상태 조합 수를 제한한다', async () => {
  await assert.rejects(
    evaluator.evaluate({
      mode: 'stylesheet',
      html: '<button class="action">저장</button>',
      expectedCss: '.action { color: red; }',
      actualCss: '.action { color: red; }',
      validation: {
        viewports: [
          { width: 320, height: 480 },
          { width: 768, height: 600 },
          { width: 1024, height: 768 },
          { width: 1280, height: 800 }
        ],
        hover: ['.action'],
        focus: ['.action', 'button']
      }
    }),
    /조합은 12개 이하/
  )
})

test('stylesheet의 외부 리소스 요청은 브라우저 밖으로 전송하지 않는다', async () => {
  let requestCount = 0
  const resourceServer = createServer((request, response) => {
    requestCount += 1
    response.writeHead(200, { 'Content-Type': 'image/png' })
    response.end()
  })
  await new Promise(resolve => resourceServer.listen(0, '127.0.0.1', resolve))

  try {
    const port = resourceServer.address().port
    const result = await evaluator.evaluate({
      mode: 'stylesheet',
      html: '<article class="card">카드</article>',
      expectedCss: '.card { color: red; }',
      actualCss: `.card { color: red; background-image: url("http://127.0.0.1:${port}/track.png"); }`
    })

    assert.equal(result.syntaxValid, false)
    assert.equal(result.diagnosticCode, 'FORBIDDEN_RESOURCE')
    assert.equal(requestCount, 0)
  } finally {
    await new Promise(resolve => resourceServer.close(resolve))
  }
})

test('전체 stylesheet 평가 제한 시간이 지나면 BrowserContext를 닫고 종료한다', async () => {
  const deadlineEvaluator = new CssEvaluator({ stylesheetTimeoutMs: 1 })
  try {
    await assert.rejects(
      deadlineEvaluator.evaluate({
        mode: 'stylesheet',
        html: '<article class="card">카드</article>',
        expectedCss: '.card { color: red; }',
        actualCss: '.card { color: red; }'
      }),
      /채점 제한 시간을 초과/
    )
  } finally {
    await deadlineEvaluator.close()
  }
})
