const expectedCounts = new Map([
  ['html', 15],
  ['selector', 19],
  ['property', 24],
  ['motion', 15],
  ['flex', 13],
  ['grid', 12],
  ['responsive', 7],
  ['ui', 10],
  ['java', 47],
  ['java-bridge', 17],
  ['java-advanced', 22],
  ['javascript', 30],
  ['algorithm', 37],
  ['algorithm-intermediate', 20]
])
const codeModes = new Set(['java', 'javascript', 'algorithm'])
const allowedModes = new Set(['html', 'selector', 'declaration', 'stylesheet', ...codeModes])
const allowedSourceContracts = new Set([
  'insertion-sort',
  'member-badge-constructor-delegation',
  'checked-port-exception',
  'function-declaration-helper',
  'arrow-function-helper',
  'rest-parameter',
  'closure-counter',
  'class-instance',
  'promise-chain',
  'async-promise-all'
])
const allowedTestContracts = new Set([
  'source-independence',
  'unmodifiable-result',
  'preserve-source-new-result',
  'empty-new-result'
])
const javascriptExecutionContracts = new Map([
  [19, {
    immutableArguments: [0],
    distinctResultFromArguments: [0]
  }],
  [20, {
    immutableArguments: [0],
    distinctResultFromArguments: [0]
  }],
  [23, {
    immutableArguments: [0],
    distinctResultFromArguments: [0]
  }],
  [24, {
    immutableArguments: [0, 1],
    distinctResultFromArguments: [0, 1]
  }],
  [26, {
    immutableArguments: [0],
    distinctResultFromArguments: [0]
  }]
])
const declarationTitleContracts = [
  {
    titles: ['자동 바깥 여백'],
    matches: declarations => /\bauto\b/.test(declarations.get('margin') ?? ''),
    expected: 'margin의 auto 값'
  },
  {
    titles: ['균일한 바깥 여백'],
    matches: declarations => /^-?(?:\d+|\d*\.\d+)(?:px|rem|em|%)$/.test(declarations.get('margin') ?? ''),
    expected: '한 개의 길이값을 가진 margin'
  },
  {
    titles: ['점선 테두리'],
    matches: declarations => /\b(?:dashed|dotted)\b/.test(declarations.get('border') ?? ''),
    expected: 'dashed 또는 dotted border'
  },
  {
    titles: ['실선 테두리'],
    matches: declarations => /\bsolid\b/.test(declarations.get('border') ?? ''),
    expected: 'solid border'
  },
  {
    titles: ['인라인 블록 표시'],
    matches: declarations => declarations.get('display') === 'inline-block',
    expected: 'display:inline-block'
  },
  {
    titles: ['블록 표시'],
    matches: declarations => declarations.get('display') === 'block',
    expected: 'display:block'
  },
  {
    titles: ['뷰포트 높이'],
    matches: declarations => /(?:^|[^a-z])\d*\.?\d+(?:d|s|l)?vh\b/.test(declarations.get('height') ?? ''),
    expected: 'vh 계열 height'
  },
  {
    titles: ['고정 높이'],
    matches: declarations => /^-?(?:\d+|\d*\.\d+)(?:px|rem|em|ch)$/.test(declarations.get('height') ?? ''),
    expected: '고정 길이값을 가진 height'
  },
  {
    titles: ['자동 넘침 처리'],
    matches: declarations => declarations.get('overflow') === 'auto',
    expected: 'overflow:auto'
  },
  {
    titles: ['숨김 넘침 처리'],
    matches: declarations => declarations.get('overflow') === 'hidden',
    expected: 'overflow:hidden'
  },
  {
    titles: ['완전 투명'],
    matches: declarations => /^(?:0|0\.0+|0%)$/.test(declarations.get('opacity') ?? ''),
    expected: 'opacity:0'
  },
  {
    titles: ['절반 투명'],
    matches: declarations => /^(?:0?\.5|50%)$/.test(declarations.get('opacity') ?? ''),
    expected: 'opacity:0.5'
  },
  {
    titles: ['원형 모서리'],
    matches: declarations => declarations.get('border-radius') === '50%',
    expected: 'border-radius:50%'
  },
  {
    titles: ['둥근 모서리'],
    matches: declarations => /(?:px|rem|em)$/.test(declarations.get('border-radius') ?? ''),
    expected: '길이값을 가진 border-radius'
  },
  {
    titles: ['오른쪽 텍스트 정렬'],
    matches: declarations => declarations.get('text-align') === 'right',
    expected: 'text-align:right'
  },
  {
    titles: ['가운데 텍스트 정렬'],
    matches: declarations => declarations.get('text-align') === 'center',
    expected: 'text-align:center'
  },
  {
    titles: ['비활성 커서'],
    matches: declarations => declarations.get('cursor') === 'not-allowed',
    expected: 'cursor:not-allowed'
  },
  {
    titles: ['포인터 커서'],
    matches: declarations => declarations.get('cursor') === 'pointer',
    expected: 'cursor:pointer'
  },
  {
    titles: ['절대 위치 방식'],
    matches: declarations => declarations.get('position') === 'absolute',
    expected: 'position:absolute'
  },
  {
    titles: ['상대 위치 방식'],
    matches: declarations => declarations.get('position') === 'relative',
    expected: 'position:relative'
  },
  {
    titles: ['확대 변형'],
    matches: declarations => /\bscale(?:x|y|3d)?\(/.test(declarations.get('transform') ?? ''),
    expected: 'scale 계열 transform'
  },
  {
    titles: ['가로 이동 변형'],
    matches: declarations => /\btranslatex\(/.test(declarations.get('transform') ?? ''),
    expected: 'translateX transform'
  }
]
function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function normalized(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

function containsExternalCssUrl(value) {
  const pattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi
  for (const match of String(value ?? '').matchAll(pattern)) {
    const url = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (url && !url.startsWith('#') && !url.toLowerCase().startsWith('data:')) return true
  }
  return false
}

function sameIntegerArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => Number.isInteger(value) && value === expected[index])
}

function declarationMap(value) {
  const declarations = new Map()
  for (const declaration of String(value ?? '').split(';')) {
    const separator = declaration.indexOf(':')
    if (separator <= 0) continue
    const property = declaration.slice(0, separator).trim().toLowerCase()
    const propertyValue = declaration.slice(separator + 1).trim().toLowerCase()
    if (property && propertyValue) declarations.set(property, propertyValue)
  }
  return declarations
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function selectorExampleRevealsAnswer(answer, example) {
  const normalizedAnswer = normalized(answer)
  const normalizedExample = normalized(example)
  if (!normalizedAnswer || !normalizedExample) return false

  if (/^[a-z][a-z0-9_-]*$/i.test(normalizedAnswer)) {
    const identifiers = normalizedExample.match(/[a-z][a-z0-9_-]*/gi) ?? []
    return identifiers.includes(normalizedAnswer)
  }

  const answerPattern = new RegExp(
    `(^|[^a-z0-9_-])${escapeRegExp(normalizedAnswer)}(?=$|[^a-z0-9_-])`,
    'i'
  )
  return answerPattern.test(normalizedExample)
}

function htmlLearningStringRevealsAnswer(answer, value) {
  const normalizedAnswer = normalized(answer)
  return normalizedAnswer.length > 0 && normalized(value).includes(normalizedAnswer)
}

function validateSelectorHintSafety(problem, location, fail) {
  for (const hint of problem.hints) {
    if (selectorExampleRevealsAnswer(problem.answer, hint)) {
      fail(location, '힌트가 기준 선택자를 그대로 노출합니다. 다른 요소와 값의 유사 예시를 사용하세요.')
    }
  }
}

function validateDeclarationMetadata(problem, location, fail) {
  if (Object.hasOwn(problem, 'accept')) {
    fail(location, '사용되지 않는 accept 필드는 declaration 문제 계약에 포함할 수 없습니다.')
  }

  const answerSnippet = normalized(problem.answer).replace(/[;{}]/g, '')
  if (answerSnippet.length >= 5 && problem.hints.some(hint =>
    normalized(hint).replace(/[;{}]/g, '').includes(answerSnippet))) {
    fail(location, '힌트가 기준 답안 선언을 그대로 노출합니다. 다른 값의 유사 예시를 사용하세요.')
  }

  const declarations = declarationMap(problem.answer)
  for (const contract of declarationTitleContracts) {
    if (contract.titles.includes(problem.title) && !contract.matches(declarations)) {
      fail(location, `제목 "${problem.title}"에는 ${contract.expected} 답안이 필요합니다.`)
    }
  }
}

function indexUnique(kind, value, location, duplicateIndex, fail) {
  const key = `${kind}:${normalized(value)}`
  if (key.endsWith(':')) return
  const existing = duplicateIndex.get(key)
  if (existing) fail(location, `${kind}이(가) ${existing}와 중복됩니다.`)
  else duplicateIndex.set(key, location)
}

function validateSolution(solution, location, mode, fail) {
  if (solution === undefined) {
    if (mode === 'selector') {
      fail(location, '선택자 문제에는 정답 후 단계별 해설 solution이 필요합니다.')
    }
    return
  }
  if (!solution || typeof solution !== 'object') {
    fail(location, 'solution은 객체여야 합니다.')
    return
  }
  if (mode === 'selector') {
    if (!Array.isArray(solution.selectorBreakdown)
        || solution.selectorBreakdown.length === 0
        || solution.selectorBreakdown.some(step =>
          !step || typeof step !== 'object'
          || !nonBlank(step.fragment)
          || !nonBlank(step.explanation))) {
      fail(location, 'solution.selectorBreakdown에는 선택자 조각과 단계별 설명이 필요합니다.')
    }
    return
  }
  for (const field of ['summary', 'alternative', 'complexity']) {
    if (!nonBlank(solution[field])) fail(location, `solution.${field}가 비어 있습니다.`)
  }
  if (!Array.isArray(solution.keyPoints) || solution.keyPoints.length === 0
      || solution.keyPoints.some(point => !nonBlank(point))) {
    fail(location, 'solution.keyPoints에는 한 개 이상의 설명이 필요합니다.')
  }
}

function validateLearning(learning, problem, location, fail) {
  if (learning === undefined) {
    if (problem.mode === 'selector') {
      fail(location, '선택자 문제에는 정답 전에 공개할 learning 교안이 필요합니다.')
    }
    return
  }
  if (!learning || typeof learning !== 'object' || Array.isArray(learning)) {
    fail(location, 'learning은 객체여야 합니다.')
    return
  }

  const forbiddenFields = new Set([
    'answer',
    'expectedAnswer',
    'referenceAnswer',
    'required',
    'selectorBreakdown',
    'solution',
    'validationJson'
  ])
  const publicStrings = []
  const inspectPublicValue = (value, path) => {
    if (typeof value === 'string') {
      publicStrings.push({ path, value })
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => inspectPublicValue(item, `${path}[${index}]`))
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [field, child] of Object.entries(value)) {
      if (forbiddenFields.has(field)) {
        fail(location, `공개 ${path}에는 금지 필드 ${field}를 포함할 수 없습니다.`)
      }
      inspectPublicValue(child, `${path}.${field}`)
    }
  }
  inspectPublicValue(learning, 'learning')
  for (const { path, value } of publicStrings) {
    if (/data-target/i.test(value)) {
      fail(location, `${path}에 내부 채점 표식 data-target을 포함할 수 없습니다.`)
    }
    if (problem.mode === 'selector'
        && selectorExampleRevealsAnswer(problem.answer, value)) {
      fail(location, `${path}이(가) 기준 선택자를 그대로 노출합니다.`)
    }
    if (problem.mode === 'html'
        && htmlLearningStringRevealsAnswer(problem.answer, value)) {
      fail(location, `${path}이(가) HTML 기준 답안을 그대로 노출합니다.`)
    }
  }

  const validateTextArray = (field, minimum, maximum) => {
    const values = learning[field]
    if (!Array.isArray(values)
        || values.length < minimum
        || values.length > maximum
        || values.some(value => !nonBlank(value))) {
      fail(location, `learning.${field}에는 ${minimum}~${maximum}개의 설명이 필요합니다.`)
      return
    }
    const unique = new Set(values.map(normalized))
    if (unique.size !== values.length) {
      fail(location, `learning.${field}에 중복된 내용이 있습니다.`)
    }
  }

  validateTextArray('keywords', 2, 4)
  validateTextArray('principles', 2, 4)
  validateTextArray('pitfalls', 1, 3)
  if (!nonBlank(learning.summary)) fail(location, 'learning.summary가 비어 있습니다.')

  if (!learning.example || typeof learning.example !== 'object'
      || !nonBlank(learning.example.code)
      || !nonBlank(learning.example.explanation)) {
    fail(location, 'learning.example에는 정답이 아닌 코드와 해석이 필요합니다.')
  }

  if (!Array.isArray(learning.applications) || learning.applications.length === 0) {
    fail(location, 'learning.applications에는 한 개 이상의 응용 사례가 필요합니다.')
  } else {
    for (const [index, application] of learning.applications.entries()) {
      if (!application || typeof application !== 'object'
          || !nonBlank(application.title)
          || !nonBlank(application.description)
          || !nonBlank(application.code)) {
        fail(location, `learning.applications[${index}]에는 제목, 설명, 코드가 필요합니다.`)
        continue
      }
    }
  }
}

function validateBaseProblem(problem, category, expectedId, duplicateIndex, fail) {
  const location = `${category}#${problem.id ?? '?'}`
  if (problem.id !== expectedId) fail(location, `문제 번호는 연속된 ${expectedId}여야 합니다.`)
  if (!allowedModes.has(problem.mode)) fail(location, `지원하지 않는 mode ${problem.mode}입니다.`)
  for (const field of ['stage', 'title', 'question', 'answer']) {
    if (!nonBlank(problem[field])) fail(location, `${field}가 비어 있습니다.`)
  }
  if (!Array.isArray(problem.hints) || problem.hints.length < 3
      || problem.hints.some(hint => !nonBlank(hint))) {
    fail(location, '정답을 직접 노출하지 않는 힌트가 최소 3개 필요합니다.')
  }
  if (Array.isArray(problem.hints)
      && !problem.hints.some(hint => /예\s*:|예시|패턴|형태|처럼/.test(hint))) {
    fail(location, '힌트 중 하나는 정답이 아닌 코드 예시나 형태를 안내해야 합니다.')
  }

  indexUnique(`${category} 제목`, problem.title, location, duplicateIndex, fail)
  indexUnique(`${category} 질문`, problem.question, location, duplicateIndex, fail)
  if (['selector', 'declaration', 'stylesheet'].includes(problem.mode)) {
    indexUnique(
      'CSS 채점 계약',
      `${problem.mode}|${problem.html ?? ''}|${problem.answer}`,
      location,
      duplicateIndex,
      fail
    )
  }
  validateSolution(problem.solution, location, problem.mode, fail)
  validateLearning(problem.learning, problem, location, fail)
}

function validateSelectorProblem(problem, category, fail) {
  const location = `${category}#${problem.id ?? '?'}`
  if (problem.mode === 'selector') {
    validateSelectorHintSafety(problem, location, fail)
    if (!nonBlank(problem.html) || !problem.html.includes('data-target')) {
      fail(location, '선택자 문제 HTML에는 data-target 정답 대상이 필요합니다.')
    }
  }
}

function validateDeclarationProblem(problem, category, fail) {
  const location = `${category}#${problem.id ?? '?'}`
  if (problem.mode === 'declaration') {
    validateDeclarationMetadata(problem, location, fail)
    if (problem.required !== undefined
        && (!problem.required || typeof problem.required !== 'object'
          || Array.isArray(problem.required) || Object.keys(problem.required).length === 0)) {
      fail(location, 'required가 있다면 한 개 이상의 CSS 속성을 가진 객체여야 합니다.')
    }
  }
}

function validateStylesheetProblem(problem, category, fail) {
  const location = `${category}#${problem.id ?? '?'}`
  if (problem.mode === 'stylesheet') {
    if (!nonBlank(problem.html)) fail(location, 'stylesheet 문제의 미리보기 HTML이 비어 있습니다.')
    if (!nonBlank(problem.starterCode)) fail(location, 'stylesheet 시작 코드가 비어 있습니다.')
    if (!Array.isArray(problem.constraints) || problem.constraints.length === 0) {
      fail(location, 'stylesheet 문제에는 구현 범위를 설명하는 제약사항이 필요합니다.')
    } else if (problem.constraints.some(constraint => /\brequired\./i.test(constraint))) {
      fail(location, '공개 제약사항에서 비공개 required 필드명을 참조할 수 없습니다.')
    }
    if (containsExternalCssUrl(problem.answer) || containsExternalCssUrl(problem.starterCode)) {
      fail(location, 'stylesheet 기준 답안과 시작 코드에는 외부 URL을 사용할 수 없습니다.')
    }
    if (!problem.required || typeof problem.required !== 'object'
        || Array.isArray(problem.required)) {
      fail(location, 'stylesheet 문제에는 viewport와 상태 채점을 위한 required 객체가 필요합니다.')
    } else {
      const allowedValidationFields = new Set(['viewports', 'hover', 'focus'])
      for (const field of Object.keys(problem.required)) {
        if (!allowedValidationFields.has(field)) {
          fail(location, `stylesheet required에는 지원하지 않는 ${field} 필드를 사용할 수 없습니다.`)
        }
      }

      const viewports = problem.required.viewports
      if (!Array.isArray(viewports) || viewports.length < 1 || viewports.length > 4) {
        fail(location, 'stylesheet required.viewports는 1~4개의 화면 크기 배열이어야 합니다.')
      } else {
        const viewportKeys = new Set()
        for (const [index, viewport] of viewports.entries()) {
          if (!viewport || typeof viewport !== 'object' || Array.isArray(viewport)
              || !Number.isInteger(viewport.width) || viewport.width < 1 || viewport.width > 1920
              || !Number.isInteger(viewport.height) || viewport.height < 1 || viewport.height > 1200) {
            fail(location, `required.viewports[${index}]의 width·height 범위가 올바르지 않습니다.`)
            continue
          }
          const viewportKey = `${viewport.width}x${viewport.height}`
          if (viewportKeys.has(viewportKey)) {
            fail(location, `required.viewports에 ${viewportKey}가 중복됩니다.`)
          }
          viewportKeys.add(viewportKey)
        }
      }

      let stateCount = 0
      for (const field of ['hover', 'focus']) {
        const selectors = problem.required[field]
        if (selectors === undefined) continue
        if (!Array.isArray(selectors) || selectors.length === 0
            || selectors.some(selector => !nonBlank(selector) || selector.length > 500)) {
          fail(location, `stylesheet required.${field}에는 유효한 selector 문자열 배열이 필요합니다.`)
          continue
        }
        if (new Set(selectors.map(normalized)).size !== selectors.length) {
          fail(location, `stylesheet required.${field}에 중복 selector가 있습니다.`)
        }
        stateCount += selectors.length
      }
      if (stateCount > 4) {
        fail(location, 'stylesheet hover와 focus 시나리오는 합쳐서 4개 이하여야 합니다.')
      }
      if (Array.isArray(viewports) && viewports.length * (stateCount + 1) > 12) {
        fail(location, 'stylesheet viewport와 상태 조합은 12개 이하여야 합니다.')
      }
    }
    if (problem.learning === undefined) {
      fail(location, 'stylesheet 문제에는 실습 전에 읽을 learning 교안이 필요합니다.')
    }
    if (/@(?:-webkit-)?keyframes\b/i.test(problem.answer)
        || /(?:^|[;{])\s*(?:animation|transition)(?:-[\w-]+)?\s*:/i.test(problem.answer)) {
      fail(
        location,
        'stylesheet 시각 채점은 시간축을 검증하지 않으므로 animation·transition은 declaration 문제로 출제해야 합니다.'
      )
    }
  }
}

function validateHtmlProblem(problem, category, fail) {
  const location = `${category}#${problem.id ?? '?'}`
  if (problem.mode === 'html') {
    if (!nonBlank(problem.starterCode)) fail(location, 'HTML 시작 코드가 비어 있습니다.')
    if (!Array.isArray(problem.constraints) || problem.constraints.length === 0) {
      fail(location, 'HTML 문제에는 학습 제약사항이 필요합니다.')
    }
    if (!Array.isArray(problem.required?.rules) || problem.required.rules.length === 0) {
      fail(location, 'HTML 문제에는 DOM 채점 규칙이 필요합니다.')
    }
    const attributeFormats = problem.required?.attributeFormats
    const attributeMatches = problem.required?.attributeMatches
    const orders = problem.required?.orders
    const forbidden = problem.required?.forbidden
    const doctype = problem.required?.doctype
    if (doctype !== undefined && typeof doctype !== 'boolean') {
      fail(location, 'doctype 규칙은 boolean이어야 합니다.')
    }
    if (attributeFormats !== undefined && !Array.isArray(attributeFormats)) {
      fail(location, 'attributeFormats는 배열이어야 합니다.')
    }
    if (attributeMatches !== undefined && !Array.isArray(attributeMatches)) {
      fail(location, 'attributeMatches는 배열이어야 합니다.')
    }
    if (orders !== undefined && !Array.isArray(orders)) {
      fail(location, 'orders는 배열이어야 합니다.')
    }
    if (forbidden !== undefined && !Array.isArray(forbidden)) {
      fail(location, 'forbidden은 배열이어야 합니다.')
    }
    for (const [ruleIndex, rule] of (Array.isArray(attributeFormats) ? attributeFormats : []).entries()) {
      if (!nonBlank(rule.selector) || !nonBlank(rule.attribute)
          || rule.format !== 'iso-local-date' || !nonBlank(rule.message)) {
        fail(location, `${ruleIndex + 1}번째 attributeFormats 규칙이 올바르지 않습니다.`)
      }
    }
    for (const [ruleIndex, rule] of (Array.isArray(attributeMatches) ? attributeMatches : []).entries()) {
      if (!nonBlank(rule.sourceSelector) || !nonBlank(rule.sourceAttribute)
          || !nonBlank(rule.targetSelector) || !nonBlank(rule.targetAttribute)
          || !nonBlank(rule.message)) {
        fail(location, `${ruleIndex + 1}번째 attributeMatches 규칙이 올바르지 않습니다.`)
      }
    }
    for (const [ruleIndex, rule] of (Array.isArray(orders) ? orders : []).entries()) {
      if (!nonBlank(rule.beforeSelector) || !nonBlank(rule.afterSelector)
          || !nonBlank(rule.message)) {
        fail(location, `${ruleIndex + 1}번째 orders 규칙이 올바르지 않습니다.`)
      }
    }
    if (category === 'html') {
      const curriculumText = JSON.stringify(problem).replaceAll('\\', '')
      const outOfScopePatterns = [
        [/\baria-[\w-]*/i, 'ARIA 속성'],
        [/\brole\s*=/i, 'role 속성'],
        [/<\s*\/?\s*time\b|datetime/i, 'time·datetime'],
        [/\btype\s*=\s*["']?(?:search|tel)\b/i, '교안 밖 input type'],
        [/<\s*\/?\s*(?:figure|figcaption|details|summary|picture)\b/i, '교안 밖 요소'],
        [/\bsrcset\s*=/i, 'srcset 속성'],
        [/\btabindex\s*=\s*["']?-1\b/i, '본문 바로가기용 tabindex=-1']
      ]
      for (const [pattern, label] of outOfScopePatterns) {
        if (pattern.test(curriculumText)) {
          fail(location, `첨부 HTML 교안 범위를 벗어난 ${label}을 포함합니다.`)
        }
      }

      const selectors = problem.required.rules.map(rule => String(rule.selector ?? ''))
      if (problem.id === 1) {
        if (doctype !== true) fail(location, '첫 문제는 표준 HTML doctype을 채점해야 합니다.')
        const documentContracts = [
          ['html[lang]', selector => selector.includes('html[lang')],
          ['meta[charset]', selector => selector.includes('head > meta') && selector.includes('[charset')],
          ['viewport meta', selector =>
            selector.includes('head > meta') && selector.includes('[name=viewport]')],
          ['head > title', selector => selector.includes('head > title')],
          ['body > main', selector => selector.includes('body > main')]
        ]
        for (const [label, matches] of documentContracts) {
          if (!selectors.some(matches)) {
            fail(location, `첫 문제에 전체 문서 구조 계약 ${label}이(가) 필요합니다.`)
          }
        }
      }

      const connectsVisibleLabels = selectors.some(selector => selector.includes('label[for'))
        && selectors.some(selector =>
          selector.includes('input')
          && (selector.includes('[id') || /\binput#[\w-]+/.test(selector)))
      if (connectsVisibleLabels
          && !(Array.isArray(attributeMatches) ? attributeMatches : []).some(rule =>
            rule.sourceAttribute === 'for' && rule.targetAttribute === 'id')) {
        fail(location, '명시적 label의 for와 input id를 연결하는 계약이 필요합니다.')
      }
    }
  }
}

function validateCodeProblem(problem, category, fail) {
  const location = `${category}#${problem.id ?? '?'}`
  if (codeModes.has(problem.mode)) {
    if (!nonBlank(problem.starterCode)) fail(location, '코드 시작 템플릿이 비어 있습니다.')
    if (normalized(problem.starterCode) === normalized(problem.answer)) {
      fail(location, '시작 코드와 기준 답안이 같습니다.')
    }
    if (!Array.isArray(problem.examples) || problem.examples.length === 0) {
      fail(location, '공개 예제가 한 개 이상 필요합니다.')
    }
    if (problem.mode === 'javascript') {
      if (!nonBlank(problem.required?.functionName)) {
        fail(location, 'JavaScript 채점 functionName이 필요합니다.')
      }
      if (problem.required?.className !== undefined || problem.required?.methodName !== undefined) {
        fail(location, 'JavaScript 문제는 className이나 methodName 대신 functionName을 사용해야 합니다.')
      }
    } else if (!nonBlank(problem.required?.className)) {
      fail(location, 'Java 채점 className이 필요합니다.')
    }
    if (problem.required?.sourceContract !== undefined
        && !allowedSourceContracts.has(problem.required.sourceContract)) {
      fail(location, `지원하지 않는 sourceContract "${problem.required.sourceContract}"입니다.`)
    }
    if (category === 'algorithm' && problem.id === 15
        && problem.required?.sourceContract !== 'insertion-sort') {
      fail(location, '삽입 정렬 문제에는 insertion-sort sourceContract가 필요합니다.')
    }
    if (category === 'java-bridge' && problem.id === 17
        && problem.required?.sourceContract !== 'member-badge-constructor-delegation') {
      fail(location, '회원 표식 문제에는 생성자 위임 sourceContract가 필요합니다.')
    }
    if (category === 'java-advanced' && problem.id === 22
        && problem.required?.sourceContract !== 'checked-port-exception') {
      fail(location, '서비스 포트 문제에는 checked 예외 sourceContract가 필요합니다.')
    }
    if (category === 'javascript') {
      const javascriptContracts = new Map([
        [13, 'function-declaration-helper'],
        [14, 'arrow-function-helper'],
        [16, 'rest-parameter'],
        [27, 'closure-counter'],
        [28, 'class-instance'],
        [29, 'promise-chain'],
        [30, 'async-promise-all']
      ])
      const expectedContract = javascriptContracts.get(problem.id)
      if (expectedContract && problem.required?.sourceContract !== expectedContract) {
        fail(location, `학습 목표 문법을 확인하는 ${expectedContract} sourceContract가 필요합니다.`)
      }

      const expectedExecutionContract = javascriptExecutionContracts.get(problem.id)
      if (expectedExecutionContract) {
        const actualExecutionContract = problem.required?.executionContract
        if (!actualExecutionContract
            || typeof actualExecutionContract !== 'object'
            || Array.isArray(actualExecutionContract)) {
          fail(location, '입력 불변성과 새 결과 객체를 확인하는 executionContract가 필요합니다.')
        } else {
          const expectedKeys = Object.keys(expectedExecutionContract).sort()
          const actualKeys = Object.keys(actualExecutionContract).sort()
          if (actualKeys.length !== expectedKeys.length
              || actualKeys.some((key, index) => key !== expectedKeys[index])) {
            fail(location, `executionContract 필드는 ${expectedKeys.join(', ')}만 허용됩니다.`)
          }
          for (const [field, expectedIndices] of Object.entries(expectedExecutionContract)) {
            if (!sameIntegerArray(actualExecutionContract[field], expectedIndices)) {
              fail(location, `executionContract.${field}는 [${expectedIndices.join(', ')}]이어야 합니다.`)
            }
          }
        }
      }
    }
    if (category === 'algorithm' && problem.id === 15) {
      const constraints = problem.constraints ?? []
      if (!problem.question.includes('solve(int[])')
          || !constraints.some(value => value.includes('별도 helper로 위임하지 않습니다'))) {
        fail(location, '삽입 정렬 문제에는 solve(int[]) 본문 직접 구현 계약을 명시해야 합니다.')
      }
    }
    const tests = problem.required?.tests
    if (!Array.isArray(tests) || tests.length < 3) {
      fail(location, '코드 문제에는 숨은 테스트를 포함해 최소 3개 테스트가 필요합니다.')
    } else {
      if (problem.mode !== 'javascript'
          && tests.some(test => !nonBlank(test.expression))
          && !nonBlank(problem.required?.methodName)) {
        fail(location, 'arguments 방식 테스트에는 methodName이 필요합니다.')
      }
      const labels = new Set()
      const testIds = new Set()
      tests.forEach((test, testIndex) => {
        if (!nonBlank(test.id) || !/^[a-z0-9][a-z0-9-]*$/.test(test.id)) {
          fail(location, `${testIndex + 1}번째 테스트 id가 유효하지 않습니다.`)
        }
        if (testIds.has(test.id)) fail(location, `테스트 id "${test.id}"가 중복됩니다.`)
        testIds.add(test.id)
        if (!nonBlank(test.label)) fail(location, `${testIndex + 1}번째 테스트 label이 비어 있습니다.`)
        if (labels.has(test.label)) fail(location, `테스트 label "${test.label}"이 중복됩니다.`)
        labels.add(test.label)
        if (!Array.isArray(test.arguments) && !nonBlank(test.expression)) {
          fail(location, `${testIndex + 1}번째 테스트에는 arguments 또는 expression이 필요합니다.`)
        }
        if (problem.mode === 'javascript' && nonBlank(test.expression)) {
          fail(location, `${testIndex + 1}번째 JavaScript 테스트는 expression 대신 JSON arguments를 사용해야 합니다.`)
        }
        if (test.expected === undefined && !nonBlank(test.expectedException)) {
          fail(location, `${testIndex + 1}번째 테스트에는 expected 또는 expectedException이 필요합니다.`)
        }
        if (test.contract !== undefined && !allowedTestContracts.has(test.contract)) {
          fail(location, `${testIndex + 1}번째 테스트 contract "${test.contract}"가 유효하지 않습니다.`)
        }
      })
      const exampleTestIds = new Set()
      problem.examples.forEach((example, exampleIndex) => {
        if (!nonBlank(example.input) || !nonBlank(example.output)) {
          fail(location, `${exampleIndex + 1}번째 공개 예제의 input/output이 비어 있습니다.`)
        }
        if (!nonBlank(example.testId)) {
          fail(location, `${exampleIndex + 1}번째 공개 예제에 명시적 testId가 필요합니다.`)
        } else if (!testIds.has(example.testId)) {
          fail(location, `${exampleIndex + 1}번째 공개 예제의 testId "${example.testId}"가 존재하지 않습니다.`)
        } else if (exampleTestIds.has(example.testId)) {
          fail(location, `공개 예제 testId "${example.testId}"가 중복됩니다.`)
        }
        exampleTestIds.add(example.testId)
      })
      if (Array.isArray(problem.examples) && tests.length <= problem.examples.length) {
        fail(location, '공개 예제와 분리된 숨은 테스트가 한 개 이상 필요합니다.')
      }
      for (const test of tests.filter(item => item.contract !== undefined)) {
        if (!nonBlank(test.expression)) {
          fail(location, `계약 테스트 "${test.contract}"에는 expression이 필요합니다.`)
        }
        if (exampleTestIds.has(test.id)) {
          fail(location, `계약 테스트 "${test.contract}"는 공개 예제와 분리된 숨은 테스트여야 합니다.`)
        }
      }
      const declaredContracts = new Set(tests.map(test => test.contract).filter(Boolean))
      const hiddenExpressions = tests
        .filter(test => !exampleTestIds.has(test.id))
        .map(test => String(test.expression ?? ''))
      if (category === 'java-bridge' && problem.id === 16
          && (!hiddenExpressions.some(expression =>
            expression.includes('RidePass first = new RidePass')
            && expression.includes('RidePass second = new RidePass'))
          || !hiddenExpressions.some(expression =>
            expression.includes('getDeclaredField("FARE_PER_RIDE")')
            && expression.includes('getDeclaredField("rides")')))) {
        fail(location, '이용권 문제에는 인스턴스 독립성과 static final/인스턴스 필드를 확인하는 숨은 테스트가 필요합니다.')
      }
      if (category === 'java-bridge' && problem.id === 17
          && !hiddenExpressions.some(expression =>
            expression.includes('MemberBadge standard = new MemberBadge')
            && expression.includes('MemberBadge admin = new MemberBadge'))) {
        fail(location, '회원 표식 문제에는 먼저 생성한 두 객체의 상태 독립성을 확인하는 숨은 테스트가 필요합니다.')
      }
      if (category === 'java-advanced' && problem.id === 21
          && !hiddenExpressions.some(expression =>
            expression.includes('new Delivery("OTHER") {}'))) {
        fail(location, '배송 안내 문제에는 알 수 없는 Delivery 하위 타입의 fallback 테스트가 필요합니다.')
      }
      if (category === 'java-advanced' && problem.id === 10
          && (!declaredContracts.has('source-independence')
            || !declaredContracts.has('unmodifiable-result'))) {
        fail(location, 'DistinctList 문제에는 원본 독립성과 반환 불변성 계약 테스트가 필요합니다.')
      }
      if (category === 'java' && problem.id === 37
          && (!declaredContracts.has('preserve-source-new-result')
            || !declaredContracts.has('empty-new-result'))) {
        fail(location, '오름차순 복사 문제에는 원본 보존과 빈 배열까지 포함한 새 배열 계약이 필요합니다.')
      }
      if (category === 'algorithm' && problem.id === 15
          && (!declaredContracts.has('preserve-source-new-result')
            || !declaredContracts.has('empty-new-result'))) {
        fail(location, '삽입 정렬 문제에는 원본 보존과 빈 배열까지 포함한 새 배열 계약이 필요합니다.')
      }
      if (category === 'java' && problem.id === 22) {
        const constraints = (problem.constraints ?? [])
          .map(value => normalized(value).replace(/[,_]/g, ''))
        const answer = normalized(problem.answer)
        const hasOverflowSafeSum = answer.includes('((long)hour+elapsed)%24')
          || answer.includes('((long)elapsed+hour)%24')
          || answer.includes('(hour+elapsed%24)%24')
          || answer.includes('(hour+(elapsed%24))%24')
        const maxElapsedTest = tests.find(test =>
          test.arguments?.[0] === '23'
          && test.arguments?.[1] === 'Integer.MAX_VALUE'
          && test.expected === '6'
          && !exampleTestIds.has(test.id))
        if (!constraints.includes('0≤hour≤23')
            || !constraints.includes('0≤elapsed≤integer.maxvalue')) {
          fail(location, '24시간 시계 문제에는 hour와 elapsed의 전체 int 입력 범위를 명시해야 합니다.')
        }
        if (!answer.includes('%24') || !hasOverflowSafeSum) {
          fail(location, '24시간 시계 기준답안은 hour+elapsed의 int overflow를 피해야 합니다.')
        }
        if (!maxElapsedTest) {
          fail(location, '23시와 Integer.MAX_VALUE 경과 시간을 검증하는 숨은 경계 테스트가 필요합니다.')
        }
      }
      if (category === 'java' && problem.id === 23) {
        const constraints = (problem.constraints ?? [])
          .map(value => normalized(value).replace(/[,_]/g, ''))
        const answer = normalized(problem.answer)
        const maxPriceTest = tests.find(test =>
          test.arguments?.[0] === 'Integer.MAX_VALUE'
          && test.arguments?.[1] === '0'
          && test.expected === 'Integer.MAX_VALUE'
          && !exampleTestIds.has(test.id))
        const onePercentTest = tests.find(test =>
          test.arguments?.[0] === 'Integer.MAX_VALUE'
          && test.arguments?.[1] === '1'
          && test.expected === '2126008810'
          && !exampleTestIds.has(test.id))
        if (!constraints.includes('0≤price≤integer.maxvalue')
            || !constraints.includes('0≤discountpercent≤100')) {
          fail(location, '할인 가격 문제에는 price와 discountPercent의 상한을 명시해야 합니다.')
        }
        if (!answer.includes('(long)price*')) {
          fail(location, '할인 가격 기준답안은 곱셈 전에 price를 long으로 승격해야 합니다.')
        }
        if (!maxPriceTest || !onePercentTest) {
          fail(location, 'Integer.MAX_VALUE 가격의 할인 없음과 1퍼센트 할인을 검증하는 숨은 테스트가 필요합니다.')
        }
      }
      if (category === 'algorithm' && problem.id === 7) {
        const constraints = (problem.constraints ?? [])
          .map(value => normalized(value).replace(/[,_]/g, ''))
        const scaleTest = tests.find(test => {
          const expression = normalized(test.expression)
          const largeRotations = new Set(
            String(test.expression ?? '').match(/\b9\d{8}\b/g) ?? []
          )
          return test.scaleTest === true
            && test.scaleRuns >= 12
            && test.expected === 'true'
            && expression.includes('100000')
            && expression.includes('999999999')
            && largeRotations.size >= 12
            && expression.includes('for(inttrial=0;trial<rotations.length;trial++)')
            && expression.includes('solution.solve(source,rotations[trial])')
            && expression.includes('index*1103515245^trial*12345')
            && expression.includes('result==source')
            && expression.includes('arrays.equals(source,snapshot)')
            && expression.includes('for(intindex=0;index<size;index++)')
            && expression.includes('snapshot[(index+offset)%size]')
            && !exampleTestIds.has(test.id)
        })
        const maxRotationTest = tests.find(test =>
          test.arguments?.[1] === '1000000000'
          && !exampleTestIds.has(test.id)
          && test.id !== scaleTest?.id)
        if (!constraints.some(constraint => constraint.includes('100000'))
            || !constraints.some(constraint => constraint.includes('1000000000'))) {
          fail(location, '배열 회전 문제에는 길이 100000과 k 1000000000의 상한을 명시해야 합니다.')
        }
        if (!scaleTest) {
          fail(location, '배열 회전에는 서로 다른 큰 k를 사용한 12회 이상의 최대 길이 입력에서 원본, 새 배열, 전체 결과를 확인하는 숨은 scaleTest가 필요합니다.')
        }
        if (!maxRotationTest) {
          fail(location, '배열 회전에는 최대 k=1000000000을 검증하는 별도 숨은 테스트가 필요합니다.')
        }
      }
      if (category === 'algorithm-intermediate' && [5, 6].includes(problem.id)) {
        const scaleTests = tests.filter(test => test.scaleTest === true)
        if (scaleTests.length === 0) {
          fail(location, '제시된 최대 입력을 실행하는 scaleTest가 필요합니다.')
        }
        const requiredMarker = problem.id === 5 ? '10000' : '200'
        if (!scaleTests.some(test =>
          nonBlank(test.expression)
          && test.expression.includes(requiredMarker)
          && !exampleTestIds.has(test.id))) {
          fail(location, `숨은 scaleTest가 최대 규모 ${requiredMarker}을 검사해야 합니다.`)
        }
        if (!problem.answer.includes('ArrayDeque')) {
          fail(location, '최대 입력에서 재귀 스택을 사용하지 않는 반복 탐색 기준답안이 필요합니다.')
        }
      }
    }
    if (problem.mode === 'algorithm'
        && (!Array.isArray(problem.constraints) || problem.constraints.length < 2)) {
      fail(location, '알고리즘 문제에는 입력 범위와 복잡도 판단을 위한 제한사항이 최소 2개 필요합니다.')
    }
  }
}

function forEachProblem(entries, inspect) {
  for (const { category, catalog } of entries) {
    if (!Array.isArray(catalog.problems)) continue
    const categoryLearning = catalog.learning
    catalog.problems.forEach((problem, index) => inspect({
      ...problem,
      learning: Object.hasOwn(problem, 'learning')
        ? problem.learning
        : categoryLearning?.[String(problem.id)]
    }, category, index + 1))
  }
}

export function defineProblemAuditRule(id, validate) {
  if (!nonBlank(id) || typeof validate !== 'function') {
    throw new TypeError('문제 감사 규칙에는 id와 validate 함수가 필요합니다.')
  }
  return Object.freeze({ id, validate })
}

const catalogMetadataRule = defineProblemAuditRule('catalog.metadata', ({ entries, fail }) => {
  for (const { file, category, catalog } of entries) {
    if (catalog.id !== category) fail(file, `루트 id는 파일명 ${category}와 같아야 합니다.`)
    if (!nonBlank(catalog.name) || !nonBlank(catalog.description)) {
      fail(file, '카테고리 이름과 설명이 필요합니다.')
    }
    if (!Array.isArray(catalog.problems)) fail(file, 'problems 배열이 없습니다.')
  }
})

const catalogCountsRule = defineProblemAuditRule('catalog.counts', ({ entries, fail }) => {
  for (const { file, category, catalog } of entries) {
    if (!Array.isArray(catalog.problems)) continue
    const expectedCount = expectedCounts.get(category)
    if (expectedCount === undefined) fail(file, '예상하지 못한 문제 카테고리입니다.')
    else if (catalog.problems.length !== expectedCount) {
      fail(file, `문제 수가 기대값 ${expectedCount}와 다른 ${catalog.problems.length}개입니다.`)
    }
    const describedCount = String(catalog.description ?? '').match(/(\d+)\s*문제/)
    if (describedCount && Number(describedCount[1]) !== catalog.problems.length) {
      fail(file, `설명에는 ${describedCount[1]}문제지만 실제로는 ${catalog.problems.length}문제입니다.`)
    }
  }
})

const catalogLearningRule = defineProblemAuditRule('catalog.learning', ({ entries, fail }) => {
  for (const { file, category, catalog } of entries) {
    if (!Array.isArray(catalog.problems)) continue
    const categoryLearning = catalog.learning
    if (categoryLearning !== undefined
        && (!categoryLearning || typeof categoryLearning !== 'object' || Array.isArray(categoryLearning))) {
      fail(file, '루트 learning은 문제 번호를 키로 사용하는 객체여야 합니다.')
    }
    if (category === 'selector' || category === 'html') {
      const expectedLearningKeys = catalog.problems.map(problem => String(problem.id)).sort()
      const actualLearningKeys = categoryLearning && typeof categoryLearning === 'object'
        ? Object.keys(categoryLearning).sort()
        : []
      if (JSON.stringify(actualLearningKeys) !== JSON.stringify(expectedLearningKeys)) {
        fail(
          file,
          category === 'selector'
            ? '선택자 learning은 모든 문제 번호와 정확히 일치해야 합니다.'
            : 'HTML learning은 모든 문제 번호와 정확히 일치해야 합니다.'
        )
      }
    }
  }
})

const catalogCategoriesRule = defineProblemAuditRule('catalog.categories', ({ entries, fail }) => {
  const expectedCategories = [...expectedCounts.keys()].sort()
  const actualCategories = entries.map(entry => entry.category).sort()
  if (JSON.stringify(actualCategories) !== JSON.stringify(expectedCategories)) {
    fail('problems', '카테고리 파일 구성이 기대 목록과 다릅니다.')
  }
})

const problemBaseRule = defineProblemAuditRule('problem.base', ({ entries, fail }) => {
  const duplicateIndex = new Map()
  forEachProblem(entries, (problem, category, expectedId) =>
    validateBaseProblem(problem, category, expectedId, duplicateIndex, fail))
})

const selectorRule = defineProblemAuditRule('problem.selector', ({ entries, fail }) => {
  forEachProblem(entries, (problem, category) => validateSelectorProblem(problem, category, fail))
})

const declarationRule = defineProblemAuditRule('problem.declaration', ({ entries, fail }) => {
  forEachProblem(entries, (problem, category) => validateDeclarationProblem(problem, category, fail))
})

const stylesheetRule = defineProblemAuditRule('problem.stylesheet', ({ entries, fail }) => {
  forEachProblem(entries, (problem, category) => validateStylesheetProblem(problem, category, fail))
})

const htmlRule = defineProblemAuditRule('problem.html', ({ entries, fail }) => {
  forEachProblem(entries, (problem, category) => validateHtmlProblem(problem, category, fail))
})

const codeRule = defineProblemAuditRule('problem.code', ({ entries, fail }) => {
  forEachProblem(entries, (problem, category) => validateCodeProblem(problem, category, fail))
})

export const problemAuditRules = Object.freeze([
  catalogMetadataRule,
  catalogCountsRule,
  catalogLearningRule,
  catalogCategoriesRule,
  problemBaseRule,
  selectorRule,
  declarationRule,
  stylesheetRule,
  htmlRule,
  codeRule
])

export function auditProblemCatalog(entries, { rules = problemAuditRules } = {}) {
  if (!Array.isArray(entries) || !Array.isArray(rules)) {
    throw new TypeError('문제 카탈로그 entries와 감사 rules는 배열이어야 합니다.')
  }
  const ruleIds = new Set()
  const failures = []
  for (const rule of rules) {
    if (!rule || !nonBlank(rule.id) || typeof rule.validate !== 'function') {
      throw new TypeError('유효하지 않은 문제 감사 규칙입니다.')
    }
    if (ruleIds.has(rule.id)) throw new Error(`중복된 문제 감사 규칙 id: ${rule.id}`)
    ruleIds.add(rule.id)
    rule.validate({
      entries,
      fail(location, message) {
        failures.push({ ruleId: rule.id, location, message })
      }
    })
  }

  const summary = entries
    .filter(entry => Array.isArray(entry.catalog.problems))
    .map(entry => `${entry.category} ${entry.catalog.problems.length}`)
  const total = [...expectedCounts.values()].reduce((sum, count) => sum + count, 0)
  return { failures, summary, total }
}

export function formatProblemAuditFailure(failure) {
  return `${failure.location}: ${failure.message}`
}
