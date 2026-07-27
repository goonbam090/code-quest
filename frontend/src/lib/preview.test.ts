import { describe, expect, it } from 'vitest'
import { previewHtmlDocument } from './preview'

describe('previewHtmlDocument', () => {
  it('renders submitted markup inside a sandbox-friendly CSP document', () => {
    const preview = previewHtmlDocument('<main><h1>HTML Quest</h1></main>')

    expect(preview).toContain("default-src 'none'")
    expect(preview).toContain('<main><h1>HTML Quest</h1></main>')
    expect(preview).not.toContain('allow-scripts')
  })
})
