import type { Problem } from '../types'

export type LearningUsage =
  | { kind: 'code'; value: string; note?: string }
  | { kind: 'context'; value: string }

export type LearningConcept = {
  overview: string
  usage: LearningUsage
  details: string[]
}

export type LearningGuideStep = {
  keyword: string
  pattern: string
  explanation: string
  application: string
}

export type LearningGuide = {
  keywords: string[]
  syntax: Array<Pick<LearningGuideStep, 'pattern' | 'explanation'>>
  applications: Array<{
    title: string
    description: string
    code?: string
  }>
  pitfalls: string[]
}

type LearningProblem = Pick<
  Problem,
  'mode' | 'question' | 'hints' | 'constraints' | 'learning'
> & Partial<Pick<Problem, 'title' | 'stage'>>

const EXAMPLE_MARKERS = [
  '비슷한 코드 예시:',
  '다른 값의 예시:',
  '비슷한 코드 패턴:',
  '비슷한 예시:',
  '조합 예시:',
  '제외 조건 예시:',
  '예:'
] as const

type MarkedExample = {
  code: string
  context: string
  note: string
}

function splitResultNote(example: MarkedExample): MarkedExample {
  const result = example.code.match(/^(.+?)의 결과는\s+(.+)$/)
    ?? example.code.match(/^(.+?[\)\]\}"'`\d])(?:은|는)\s+(.+)$/)
  if (!result) return example
  const resultNote = `결과는 ${result[2].trim()}`
  return {
    ...example,
    code: result[1].trim(),
    note: [resultNote, example.note].filter(Boolean).join(' ')
  }
}

function looksLikeCode(mode: Problem['mode'], value: string) {
  if (
    mode === 'selector'
    || mode === 'declaration'
    || mode === 'stylesheet'
    || mode === 'html'
  ) return true
  if (!/[가-힣]/.test(value)) return true
  return /[;{}]|=>|::|\+\+|--|===|!==|\?\?|\s\?\s.+\s:\s|&&|\|\||\b(?:return|throw|new|if|for|while|switch|case|class|interface|record|enum|function|const|let|var|static|final|public|private|protected|extends|implements|try|catch|import)\b|\w+\s*\([^)]*\)/.test(value)
}

function markedExample(hint: string): MarkedExample | null {
  const match = EXAMPLE_MARKERS
    .map(marker => ({ marker, index: hint.indexOf(marker) }))
    .filter(item => item.index >= 0)
    .sort((left, right) => left.index - right.index || right.marker.length - left.marker.length)[0]

  if (!match) return null

  const context = hint.slice(0, match.index).trim()
  const example = hint.slice(match.index + match.marker.length).trim()
  if (!example) return null

  const [code, ...noteParts] = example.split(/\s+[—–]\s+/)
  if (!code.trim()) return null
  return {
    code: code.trim(),
    context,
    note: noteParts.join(' — ').trim()
  }
}

function addUnique(items: string[], value: string) {
  const normalized = value.trim()
  if (normalized && !items.includes(normalized)) items.push(normalized)
}

function addGuideStep(
  steps: LearningGuideStep[],
  condition: boolean,
  step: LearningGuideStep
) {
  if (condition && !steps.some(item => item.keyword === step.keyword)) {
    steps.push(step)
  }
}

function selectorGuideSteps(problem: LearningProblem, concept: LearningConcept) {
  const usage = concept.usage.value
  const source = [
    problem.title,
    problem.question,
    ...problem.hints,
    usage,
    concept.usage.kind === 'code' ? concept.usage.note : ''
  ].filter(Boolean).join(' ')
  const steps: LearningGuideStep[] = []

  addGuideStep(steps, /:has\s*\(/i.test(source), {
    keyword: ':has()',
    pattern: '후보:has(상대 선택자)',
    explanation: '괄호 안 상대 선택자가 후보 요소를 기준으로 일치할 때 그 후보 요소 자체를 선택합니다.',
    application: '오류 필드를 포함한 행뿐 아니라 특정 형제 앞의 요소처럼 요소 사이 관계를 기준으로 후보를 찾을 때 활용합니다.'
  })
  addGuideStep(steps, /:is\s*\(/i.test(source), {
    keyword: ':is()',
    pattern: ':is(선택자1, 선택자2)',
    explanation: '여러 선택자 후보를 하나의 괄호 안에 묶어 뒤의 공통 조건을 한 번만 작성합니다.',
    application: '링크와 버튼처럼 태그는 달라도 같은 활성 상태를 공유하는 UI를 간결하게 선택할 때 활용합니다.'
  })
  addGuideStep(steps, /:where\s*\(/i.test(source), {
    keyword: ':where()',
    pattern: ':where(선택자1, 선택자2)',
    explanation: '여러 선택자를 묶되 괄호 안 선택자의 명시도를 0으로 계산합니다.',
    application: '기본 컴포넌트 스타일처럼 나중에 쉽게 덮어써야 하는 공통 규칙의 범위를 묶을 때 활용합니다.'
  })
  addGuideStep(steps, /:not\s*\(/i.test(source), {
    keyword: ':not()',
    pattern: '기본 선택자:not(제외 조건)',
    explanation: '기본 후보 중 괄호 안 조건에 일치하는 요소만 제외합니다.',
    application: '삭제된 항목, 공지 글, 비활성 버튼처럼 예외 상태만 빼고 나머지를 처리할 때 활용합니다.'
  })
  addGuideStep(steps, /:nth-of-type\s*\(/i.test(source), {
    keyword: ':nth-of-type()',
    pattern: '태그:nth-of-type(순서)',
    explanation: '형제 전체가 아니라 같은 태그 종류끼리만 순서를 계산합니다.',
    application: '서로 다른 태그가 섞인 영역에서 특정 종류의 두 번째 제목이나 세 번째 항목을 찾을 때 활용합니다.'
  })
  addGuideStep(steps, /:nth-child\s*\(/i.test(source), {
    keyword: ':nth-child()',
    pattern: '요소:nth-child(an+b)',
    explanation: '같은 부모 아래 모든 형제의 위치를 기준으로 순서나 반복 주기를 계산합니다.',
    application: '표의 짝수 행, 카드의 3개 주기 항목처럼 반복되는 목록에 규칙적인 스타일을 줄 때 활용합니다.'
  })
  addGuideStep(steps, /:first-child\b/i.test(source), {
    keyword: ':first-child',
    pattern: '요소:first-child',
    explanation: '선택한 요소가 부모의 첫 번째 자식일 때만 일치합니다.',
    application: '목록 첫 항목의 위쪽 여백을 없애거나 첫 카드만 강조할 때 활용합니다.'
  })
  addGuideStep(steps, /:last-child\b/i.test(source), {
    keyword: ':last-child',
    pattern: '요소:last-child',
    explanation: '선택한 요소가 부모의 마지막 자식일 때만 일치합니다.',
    application: '마지막 항목의 구분선이나 아래쪽 여백만 제거할 때 활용합니다.'
  })
  addGuideStep(steps, /:only-of-type\b/i.test(source), {
    keyword: ':only-of-type',
    pattern: '태그:only-of-type',
    explanation: '같은 부모 아래 동일한 태그 종류가 하나뿐일 때 일치합니다.',
    application: '카드 안에 제목이 하나만 있을 때처럼 같은 종류의 형제가 없는 요소를 구분할 때 활용합니다.'
  })
  addGuideStep(steps, /:invalid\b/i.test(source), {
    keyword: ':invalid',
    pattern: '입력 요소:invalid',
    explanation: 'required, type, pattern 등의 HTML 제약 조건을 현재 만족하지 못한 폼 요소를 선택합니다.',
    application: '제출 전 이메일 형식이나 필수 입력이 잘못된 필드를 시각적으로 안내할 때 활용합니다.'
  })
  addGuideStep(steps, /:required\b/i.test(source), {
    keyword: ':required',
    pattern: '입력 요소:required',
    explanation: 'HTML에서 필수 입력으로 지정된 폼 요소를 상태 의사 클래스로 선택합니다.',
    application: '필수 입력란의 라벨이나 테두리를 구분해 사용자가 입력 우선순위를 알 수 있게 할 때 활용합니다.'
  })
  addGuideStep(steps, /\baria-[\w-]+\b/i.test(source), {
    keyword: 'ARIA 상태 속성',
    pattern: '[aria-current="page"]',
    explanation: 'aria-* 속성에 기록된 접근성 상태와 값을 CSS 선택 조건으로 사용합니다.',
    application: '현재 메뉴, 펼쳐진 버튼, 선택된 탭처럼 보이는 상태와 보조기기 상태를 함께 표현할 때 활용합니다.'
  })
  addGuideStep(steps, /\[\s*[\w:-]+\s*\|=/i.test(source), {
    keyword: '|= 속성 연산자',
    pattern: '[속성|="값"]',
    explanation: '속성값이 정확히 같거나 지정한 값과 하이픈(-)으로 이어질 때 일치합니다.',
    application: 'ko와 ko-KR, en과 en-US처럼 기본 언어 코드와 하위 코드를 함께 선택할 때 활용합니다.'
  })
  addGuideStep(steps, /\[\s*[\w:-]+\s*~=/i.test(source), {
    keyword: '~= 속성 연산자',
    pattern: '[속성~="단어"]',
    explanation: '공백으로 구분된 속성값 목록에서 독립된 한 단어와 정확히 일치하는지 확인합니다.',
    application: 'data-tag="sale featured"처럼 여러 단어를 가진 메타데이터에서 특정 태그만 찾을 때 활용합니다.'
  })
  addGuideStep(steps, /\[\s*[\w:-]+\s*\^=/i.test(source), {
    keyword: '^= 속성 연산자',
    pattern: '[속성^="시작값"]',
    explanation: '속성값이 지정한 문자열로 시작할 때 일치합니다.',
    application: 'user-로 시작하는 데이터 ID나 특정 경로로 시작하는 링크를 묶어 처리할 때 활용합니다.'
  })
  addGuideStep(steps, /\[\s*[\w:-]+\s*\$=/i.test(source), {
    keyword: '$= 속성 연산자',
    pattern: '[속성$="끝값"]',
    explanation: '속성값이 지정한 문자열로 끝날 때 일치합니다.',
    application: '파일 링크의 .pdf 확장자나 이미지의 .webp 확장자를 구분할 때 활용합니다.'
  })
  addGuideStep(steps, /\[\s*[\w:-]+\s*=/i.test(source), {
    keyword: '속성값 일치',
    pattern: '[속성="값"]',
    explanation: '속성과 값이 모두 정확히 같은 요소만 선택합니다.',
    application: 'input type, data-state, aria-current처럼 값이 상태나 역할을 나타낼 때 활용합니다.'
  })
  addGuideStep(
    steps,
    /속성 존재|특정 속성을 가진|input\[required\]|a\[download\]|img\[alt\]/i.test(source)
      || /\[\s*[\w:-]+\s*\]/.test(usage),
    {
      keyword: '속성 존재 선택자',
      pattern: '요소[속성]',
      explanation: '속성값과 관계없이 해당 속성을 가지고 있는 요소를 선택합니다.',
      application: '필수 입력, 다운로드 링크, 대체 텍스트가 있는 이미지처럼 속성의 존재 자체가 의미일 때 활용합니다.'
    }
  )
  addGuideStep(steps, /직계 자식|자식 선택자|자식 결합자|문법은 [^.]*>|>는 직계 자식/i.test(source), {
    keyword: '직계 자식 결합자',
    pattern: '부모 > 자식',
    explanation: '부모 바로 아래 한 단계에 있는 자식만 선택하고 더 깊은 후손은 제외합니다.',
    application: '중첩 카드 안쪽까지 번지지 않게 현재 컴포넌트의 직접 자식만 꾸밀 때 활용합니다.'
  })
  addGuideStep(steps, /인접 형제|바로 다음 형제|\+ 선택자|\+는 바로 뒤/i.test(source), {
    keyword: '인접 형제 결합자',
    pattern: '앞 요소 + 다음 형제',
    explanation: '같은 부모를 가진 형제 중 앞 요소의 바로 다음 요소 하나만 선택합니다.',
    application: '라벨 바로 뒤 입력창이나 제목 바로 다음 설명처럼 서로 붙어 있는 한 쌍을 연결할 때 활용합니다.'
  })
  addGuideStep(steps, /일반 형제|뒤에 나오는 같은 부모|~ 선택자/i.test(source), {
    keyword: '일반 형제 결합자',
    pattern: '앞 요소 ~ 뒤 형제',
    explanation: '같은 부모 아래에서 앞 요소보다 뒤에 나오는 모든 일치 형제를 선택합니다.',
    application: '체크박스 뒤의 여러 안내 요소나 제목 이후의 모든 관련 항목을 바꿀 때 활용합니다.'
  })
  addGuideStep(steps, /자손 선택자|후손 요소|후손 중|공백은 .*후손|모든 후손/i.test(source), {
    keyword: '자손 결합자',
    pattern: '부모 후손',
    explanation: '공백 왼쪽 요소 안에 있는 모든 깊이의 일치하는 후손을 선택합니다.',
    application: '특정 카드나 폼 내부의 요소만 범위를 좁혀 선택하되 중첩 깊이는 제한하지 않을 때 활용합니다.'
  })
  addGuideStep(
    steps,
    /클래스 선택자/i.test(source) || /(^|[\s>,+~(])\.[a-z_-][\w-]*/i.test(usage),
    {
      keyword: '클래스 선택자',
      pattern: '.클래스명',
      explanation: 'class 속성값 앞에 점(.)을 붙여 같은 클래스를 가진 모든 요소를 선택합니다.',
      application: '버튼, 카드, 배지처럼 여러 곳에서 재사용하는 컴포넌트 스타일을 묶을 때 활용합니다.'
    }
  )
  addGuideStep(steps, /\bID 선택자\b/i.test(source) || /(^|[\s>,+~(])#[a-z_-][\w-]*/i.test(usage), {
    keyword: 'ID 선택자',
    pattern: '#아이디명',
    explanation: 'id 속성값 앞에 #을 붙여 문서에서 고유한 요소를 선택합니다.',
    application: '페이지의 단일 앱 루트나 고유한 영역처럼 한 번만 존재하는 대상을 가리킬 때 활용합니다.'
  })
  addGuideStep(steps, /\b태그 선택자\b/i.test(source), {
    keyword: '태그 선택자',
    pattern: 'article',
    explanation: 'HTML 태그 이름을 그대로 적어 같은 종류의 요소를 모두 선택합니다.',
    application: '문서 안의 모든 문단이나 버튼처럼 동일한 기본 요소에 공통 규칙을 적용할 때 활용합니다.'
  })

  return steps.slice(0, 4)
}

const codeKeywordPatterns = [
  ['조건문', /\b(?:if|else|switch|case)\b|조건문|조건 분기/i],
  ['반복문', /\b(?:for|while|do)\b|반복문|순회/i],
  ['클래스·객체', /\b(?:class|new|constructor|this)\b|클래스|객체|생성자/i],
  ['인터페이스', /\binterface\b|인터페이스/i],
  ['예외 처리', /\b(?:try|catch|throw|throws)\b|예외 처리/i],
  ['List', /\b(?:ArrayList|List)\b/],
  ['Map', /\b(?:HashMap|Map)\b/],
  ['Set', /\b(?:HashSet|Set)\b/],
  ['Stack·Queue', /\b(?:Stack|Queue|Deque|ArrayDeque)\b|스택|큐|덱/i],
  ['정렬', /\b(?:sort|sorted|Comparator)\b|정렬/i],
  ['BFS·DFS', /\b(?:BFS|DFS)\b|너비 우선|깊이 우선/i],
  ['비동기 처리', /\b(?:async|await|Promise)\b|비동기/i],
  ['함수', /\b(?:function|return)\b|함수|메서드/i],
  ['배열', /\b(?:array|Arrays)\b|배열/i]
] as const

function generalKeywords(problem: LearningProblem, concept: LearningConcept) {
  const source = [
    problem.title,
    problem.question,
    ...problem.hints,
    concept.usage.value
  ].filter(Boolean).join(' ')
  const keywords: string[] = []

  if (
    (problem.mode === 'declaration' || problem.mode === 'stylesheet')
    && concept.usage.kind === 'code'
  ) {
    const propertyMatches = concept.usage.value.matchAll(/(?:^|[;{])\s*([a-z-]+)\s*:/gi)
    for (const match of propertyMatches) addUnique(keywords, match[1])
  } else if (problem.mode === 'html' && concept.usage.kind === 'code') {
    for (const match of concept.usage.value.matchAll(/<([a-z][\w-]*)\b/gi)) {
      addUnique(keywords, `<${match[1]}>`)
    }
    for (const match of concept.usage.value.matchAll(/\s((?:aria-|data-)?[a-z][\w-]*)=/gi)) {
      addUnique(keywords, match[1])
    }
  } else {
    for (const [label, pattern] of codeKeywordPatterns) {
      if (pattern.test(source)) addUnique(keywords, label)
    }
  }

  if (keywords.length === 0) addUnique(keywords, problem.title ?? problem.stage ?? '핵심 개념')
  return keywords.slice(0, 4)
}

function practiceApplication(question: string) {
  const normalized = question.trim().replace(/[.!?。]+$/, '')
  return `문제 상황 적용: ${normalized}.`
}

function transferApplication(mode: Problem['mode']) {
  switch (mode) {
    case 'html':
      return '다른 페이지에 적용할 때도 태그의 의미와 label·aria 속성의 연결 관계를 함께 유지합니다.'
    case 'declaration':
    case 'stylesheet':
      return '카드·버튼·레이아웃에 같은 속성을 재사용하되 크기와 간격 값은 화면 요구사항에 맞게 조정합니다.'
    case 'javascript':
      return '입력값이 달라지는 함수에서도 같은 문법을 적용하고 빈 값과 경계값을 실행 결과로 확인합니다.'
    case 'java':
      return '메서드 입력과 객체 상태가 바뀌어도 타입과 반환 계약을 유지하는 방식으로 같은 개념을 적용합니다.'
    case 'algorithm':
      return '입력 크기가 커질 때 반복 횟수와 자료구조 비용을 계산해 같은 풀이 전략을 확장합니다.'
    default:
      return '예시의 이름과 값이 바뀌어도 선택 조건과 관계를 같은 순서로 읽어 적용합니다.'
  }
}

export function createLearningGuide(
  problem: LearningProblem,
  concept = createLearningConcept(problem)
): LearningGuide {
  if (problem.learning) {
    return {
      keywords: problem.learning.keywords,
      syntax: [{
        pattern: problem.learning.example.code,
        explanation: problem.learning.example.explanation
      }],
      applications: problem.learning.applications,
      pitfalls: problem.learning.pitfalls
    }
  }

  const selectorSteps = problem.mode === 'selector'
    ? selectorGuideSteps(problem, concept)
    : []
  const keywords = selectorSteps.length > 0
    ? selectorSteps.map(step => step.keyword)
    : generalKeywords(problem, concept)
  const syntax = selectorSteps.length > 0
    ? selectorSteps.map(({ pattern, explanation }) => ({ pattern, explanation }))
      : concept.usage.kind === 'code'
      ? [{
        pattern: concept.usage.value,
        explanation: concept.usage.note ?? concept.overview
      }]
      : []
  const applicationDescriptions = selectorSteps.map(step => step.application)
  addUnique(applicationDescriptions, practiceApplication(problem.question))
  addUnique(applicationDescriptions, transferApplication(problem.mode))

  return {
    keywords,
    syntax,
    applications: applicationDescriptions.slice(0, 4).map((description, index) => ({
      title: index === 0 ? '이 문제에서 적용' : '다른 화면에 응용',
      description
    })),
    pitfalls: []
  }
}

export function createLearningConcept(
  problem: LearningProblem
): LearningConcept {
  if (problem.learning) {
    return {
      overview: problem.learning.summary,
      usage: {
        kind: 'code',
        value: problem.learning.example.code,
        note: problem.learning.example.explanation
      },
      details: problem.learning.principles
    }
  }

  const hints = problem.hints.map(hint => hint.trim()).filter(Boolean)
  const overview = hints[0] ?? problem.question
  const details: string[] = []
  let example: MarkedExample | null = null

  for (const [hintIndex, hint] of hints.entries()) {
    const marked = markedExample(hint)
    const nextExample = marked ? splitResultNote(marked) : null
    if (nextExample && !example) example = nextExample
    if (hintIndex === 0 && hint === overview) continue
    if (!nextExample) {
      addUnique(details, hint)
      continue
    }
    addUnique(details, nextExample.context)
    if (looksLikeCode(problem.mode, nextExample.code)) {
      addUnique(details, nextExample.note)
    } else {
      addUnique(details, nextExample.code)
      addUnique(details, nextExample.note)
    }
  }

  if (details.length < 2) {
    const constraint = problem.constraints.find(item => item.trim())
    if (constraint) addUnique(details, `실습에서 지킬 조건: ${constraint}`)
  }
  if (details.length === 0) addUnique(details, problem.question)

  return {
    overview,
    usage: example && looksLikeCode(problem.mode, example.code)
      ? { kind: 'code', value: example.code, ...(example.note ? { note: example.note } : {}) }
      : example
        ? { kind: 'context', value: [example.code, example.note].filter(Boolean).join(' ') }
      : { kind: 'context', value: hints[1] ?? problem.question },
    details: details.slice(0, 3)
  }
}
