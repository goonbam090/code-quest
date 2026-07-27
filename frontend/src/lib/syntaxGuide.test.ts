import { describe, expect, it } from 'vitest'
import { createSyntaxGuide } from './syntaxGuide'

describe('Java quick syntax guide', () => {
  it('extracts the short code example and classifies control syntax', () => {
    const guide = createSyntaxGuide({
      mode: 'java',
      hints: [
        '반복 범위를 확인하세요.',
        '비슷한 예시: for (int i = 0; i < limit; i++) if (values[i] > 0) count++;'
      ]
    })

    expect(guide).toEqual({
      code: 'for (int i = 0; i < limit; i++) if (values[i] > 0) count++;',
      topics: ['조건문', '반복문']
    })
  })

  it('classifies collection examples', () => {
    const guide = createSyntaxGuide({
      mode: 'java',
      hints: ['비슷한 예시: Set<String> names = new LinkedHashSet<>();']
    })

    expect(guide?.topics).toEqual(['컬렉션·배열'])
  })

  it('classifies applied object, exception, and stream syntax', () => {
    expect(createSyntaxGuide({
      mode: 'java',
      hints: ['비슷한 예시: final class Age { Age(int value) { if (value < 0) throw new IllegalArgumentException(); } }']
    })?.topics).toEqual(['객체지향', '예외 처리', '조건문'])

    expect(createSyntaxGuide({
      mode: 'java',
      hints: ['비슷한 예시: values.stream().filter(predicate).map(String::valueOf).toList()']
    })?.topics).toEqual(['람다·스트림'])
  })

  it('does not expose a quick syntax card for algorithm problems', () => {
    expect(createSyntaxGuide({
      mode: 'algorithm',
      hints: ['비슷한 예시: for (int i = 0; i < n; i++)']
    })).toBeNull()
  })

  it('classifies JavaScript collection and async examples', () => {
    expect(createSyntaxGuide({
      mode: 'javascript',
      hints: ['다른 값의 예시: const unique = [...new Set(values)];']
    })?.topics).toEqual(['변수·스코프', 'Map·Set', '함수 문법'])

    expect(createSyntaxGuide({
      mode: 'javascript',
      hints: ['비슷한 예시: async function load(value) { return await Promise.resolve(value); }']
    })?.topics).toEqual(['비동기'])
  })
})
