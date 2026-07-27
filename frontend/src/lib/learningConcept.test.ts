import { describe, expect, it } from 'vitest'
import { createLearningConcept, createLearningGuide } from './learningConcept'

describe('learning concept content', () => {
  it('uses curated learning content before hint-based fallbacks', () => {
    const problem = {
      mode: 'selector' as const,
      title: '댓글',
      question: '삭제되지 않은 댓글의 작성자를 선택하세요.',
      hints: ['이 문장은 카드에 표시되면 안 됩니다.'],
      constraints: [],
      learning: {
        keywords: [':not()', '속성 부재', '자손 결합자'],
        summary: '속성이 있는 후보를 제외한 뒤 내부 요소를 찾습니다.',
        example: {
          code: '.row:not([hidden]) .name',
          explanation: '숨겨지지 않은 row 안의 name을 선택합니다.'
        },
        principles: [
          '[attr]은 속성 존재를 검사합니다.',
          '공백은 모든 깊이의 후손을 찾습니다.'
        ],
        applications: [{
          title: '숨김 행 제외',
          description: '보이는 항목의 이름만 꾸밉니다.',
          code: '.item:not([hidden]) .label'
        }],
        pitfalls: ['속성 존재와 속성값 일치를 구분합니다.']
      }
    }

    const concept = createLearningConcept(problem)
    const guide = createLearningGuide(problem, concept)

    expect(concept).toEqual({
      overview: '속성이 있는 후보를 제외한 뒤 내부 요소를 찾습니다.',
      usage: {
        kind: 'code',
        value: '.row:not([hidden]) .name',
        note: '숨겨지지 않은 row 안의 name을 선택합니다.'
      },
      details: [
        '[attr]은 속성 존재를 검사합니다.',
        '공백은 모든 깊이의 후손을 찾습니다.'
      ]
    })
    expect(guide).toEqual({
      keywords: [':not()', '속성 부재', '자손 결합자'],
      syntax: [{
        pattern: '.row:not([hidden]) .name',
        explanation: '숨겨지지 않은 row 안의 name을 선택합니다.'
      }],
      applications: [{
        title: '숨김 행 제외',
        description: '보이는 항목의 이름만 꾸밉니다.',
        code: '.item:not([hidden]) .label'
      }],
      pitfalls: ['속성 존재와 속성값 일치를 구분합니다.']
    })
  })

  it('derives concrete selector keywords when curated metadata is not available yet', () => {
    const problem = {
      mode: 'selector' as const,
      title: '필수 입력',
      question: '가입 폼 안의 필수 입력을 선택하세요.',
      hints: [
        '속성 선택자와 자손 선택자를 조합합니다.',
        '조합 예시: .signup input[required]',
        '공백은 모든 깊이의 후손을 찾습니다.'
      ],
      constraints: []
    }

    expect(createLearningGuide(problem).keywords).toEqual([
      '속성 존재 선택자',
      '자손 결합자',
      '클래스 선택자'
    ])
  })

  it('separates an inline selector example from its explanation', () => {
    expect(createLearningConcept({
      mode: 'selector',
      question: 'note 클래스를 선택하세요.',
      hints: [
        '클래스 선택자를 사용합니다.',
        '같은 class 값을 가진 요소를 선택합니다. 예: .note, .card',
        'class 이름 앞에 점을 붙입니다.'
      ],
      constraints: []
    })).toEqual({
      overview: '클래스 선택자를 사용합니다.',
      usage: { kind: 'code', value: '.note, .card' },
      details: [
        '같은 class 값을 가진 요소를 선택합니다.',
        'class 이름 앞에 점을 붙입니다.'
      ]
    })
  })

  it('keeps the note after a selector pattern as detailed guidance', () => {
    const concept = createLearningConcept({
      mode: 'selector',
      question: '필수 입력을 선택하세요.',
      hints: [
        '속성 선택자와 자손 선택자를 조합합니다.',
        '조합 예시: .signup input[required] — 공백은 signup 안의 후손을 찾습니다.',
        'required는 필수 입력을 나타냅니다.'
      ],
      constraints: []
    })

    expect(concept.usage).toEqual({
      kind: 'code',
      value: '.signup input[required]',
      note: '공백은 signup 안의 후손을 찾습니다.'
    })
    expect(concept.details).toContain('공백은 signup 안의 후손을 찾습니다.')
  })

  it('extracts an interface implementation example without using a solution', () => {
    const concept = createLearningConcept({
      mode: 'java',
      question: '할인 정책 인터페이스를 구현하세요.',
      hints: [
        '구체 클래스 대신 인터페이스에 의존합니다.',
        '비슷한 예시: interface Formatter { String format(String value); } final class UpperFormatter implements Formatter { public String format(String value) { return value.toUpperCase(); } }',
        '구현 클래스는 계약한 메서드를 재정의합니다.'
      ],
      constraints: []
    })

    expect(concept.usage).toEqual({
      kind: 'code',
      value: 'interface Formatter { String format(String value); } final class UpperFormatter implements Formatter { public String format(String value) { return value.toUpperCase(); } }'
    })
    expect(concept.details).toEqual(['구현 클래스는 계약한 메서드를 재정의합니다.'])
  })

  it('falls back to a readable usage context instead of inventing code', () => {
    const concept = createLearningConcept({
      mode: 'html',
      question: '의미 있는 구조를 만드세요.',
      hints: ['시맨틱 태그를 사용합니다.', '영역의 역할이 드러나는 태그를 고릅니다.'],
      constraints: ['제목을 포함합니다.']
    })

    expect(concept.usage).toEqual({
      kind: 'context',
      value: '영역의 역할이 드러나는 태그를 고릅니다.'
    })
    expect(concept.details).toEqual([
      '영역의 역할이 드러나는 태그를 고릅니다.',
      '실습에서 지킬 조건: 제목을 포함합니다.'
    ])
  })

  it('keeps a natural-language algorithm strategy out of a code block', () => {
    const concept = createLearningConcept({
      mode: 'algorithm',
      question: 'N-Queens 배치 수를 구하세요.',
      hints: [
        '행을 하나씩 내려가며 사용할 열을 선택하세요.',
        '비슷한 예시: 사용한 열과 두 대각선을 boolean[]로 표시하고 재귀 후 원상복구합니다.',
        '대각선은 row-column과 row+column 값으로 확인합니다.'
      ],
      constraints: []
    })

    expect(concept.usage).toEqual({
      kind: 'context',
      value: '사용한 열과 두 대각선을 boolean[]로 표시하고 재귀 후 원상복구합니다.'
    })
  })

  it('does not split a Korean particle inside a natural-language strategy', () => {
    const concept = createLearningConcept({
      mode: 'algorithm',
      question: '섬의 개수를 구하세요.',
      hints: [
        '연결된 칸을 한 번에 탐색합니다.',
        '비슷한 예시: 상하좌우 방향 배열과 ArrayDeque를 만들고 같은 섬의 칸을 큐로 탐색합니다.',
        '방문한 칸은 다시 세지 않습니다.'
      ],
      constraints: []
    })

    expect(concept.usage).toEqual({
      kind: 'context',
      value: '상하좌우 방향 배열과 ArrayDeque를 만들고 같은 섬의 칸을 큐로 탐색합니다.'
    })
  })

  it('separates a JavaScript expression from its stated result', () => {
    const concept = createLearningConcept({
      mode: 'javascript',
      question: '문자 숫자를 변환하세요.',
      hints: [
        '문자열을 숫자로 바꿉니다.',
        '다른 값의 예시: Number("15")는 숫자 15입니다.',
        '변환한 뒤 덧셈합니다.'
      ],
      constraints: []
    })

    expect(concept.usage).toEqual({
      kind: 'code',
      value: 'Number("15")',
      note: '결과는 숫자 15입니다.'
    })
  })

  it('recognizes a ternary expression with Korean string values as code', () => {
    const concept = createLearningConcept({
      mode: 'javascript',
      question: '점수에 맞는 배지를 반환하세요.',
      hints: [
        '두 결과 중 하나를 고릅니다.',
        '다른 값의 예시: age >= 20 ? "성인" : "미성년"',
        '경계값을 포함하는지 확인합니다.'
      ],
      constraints: []
    })

    expect(concept.usage).toEqual({
      kind: 'code',
      value: 'age >= 20 ? "성인" : "미성년"'
    })
  })
})
