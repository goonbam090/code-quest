import { describe, expect, it } from 'vitest'
import { formatHtml } from './formatHtml'

describe('formatHtml', () => {
  it('formats nested one-line markup with two-space indentation', () => {
    expect(formatHtml('<main><section><p>Hello</p></section></main>')).toBe(
      '<main>\n  <section>\n    <p>Hello</p>\n  </section>\n</main>'
    )
  })

  it('does not increase indentation after void elements', () => {
    expect(formatHtml('<form><input placeholder="email"><button>Login</button></form>')).toBe(
      '<form>\n  <input placeholder="email">\n  <button>Login</button>\n</form>'
    )
  })

  it('normalizes already formatted markup', () => {
    expect(formatHtml('<div>\n    <span>A</span>\n</div>')).toBe(
      '<div>\n  <span>A</span>\n</div>'
    )
  })
})
