import { describe, expect, it } from 'vitest'
import { previewDocument, previewHtmlDocument } from './preview'

describe('previewDocument', () => {
  it('keeps selector answers as highlighted target rules', () => {
    const preview = previewDocument('<button class="target">저장</button>', '.target', 'selector')

    expect(preview).toContain('.target { outline: 4px solid #9b87ff')
  })

  it('keeps declaration answers scoped to the preview target', () => {
    const preview = previewDocument('<div data-preview>대상</div>', 'display: flex;', 'declaration')

    expect(preview).toContain('[data-preview] { display: flex; }')
  })

  it('applies a stylesheet answer as complete CSS rules', () => {
    const answer = '.card { display: grid; gap: 1rem; }'
    const preview = previewDocument('<article class="card">카드</article>', answer, 'stylesheet')

    expect(preview).toContain("default-src 'none'")
    expect(preview).toContain("style-src 'unsafe-inline'")
    expect(preview).toContain('img-src data:')
    expect(preview).toContain('body{margin:0;padding:0;')
    expect(preview).toContain(answer)
    expect(preview).not.toContain(`[data-preview] { ${answer} }`)
  })
})

describe('previewHtmlDocument', () => {
  it('renders submitted markup inside a sandbox-friendly CSP document', () => {
    const preview = previewHtmlDocument('<main><h1>HTML Quest</h1></main>')

    expect(preview).toContain("default-src 'none'")
    expect(preview).toContain('<main><h1>HTML Quest</h1></main>')
    expect(preview).not.toContain('allow-scripts')
  })

  it('preserves a complete submitted document without nesting another html document', () => {
    const answer = '<!doctype html><html lang="ko"><head><title>우편함</title></head><body><main>편지</main></body></html>'
    const preview = previewHtmlDocument(answer)

    expect(preview.match(/<!doctype html>/gi)).toHaveLength(1)
    expect(preview.match(/<html(?:\s|>)/gi)).toHaveLength(1)
    expect(preview.match(/<body(?:\s|>)/gi)).toHaveLength(1)
    expect(preview).toContain("default-src 'none'")
    expect(preview.indexOf("default-src 'none'")).toBeLessThan(preview.indexOf('<title>우편함</title>'))
  })
})
