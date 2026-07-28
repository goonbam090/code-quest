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
})
