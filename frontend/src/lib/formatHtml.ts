const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
])

function tagName(token: string) {
  return token.match(/^<\/?\s*([a-zA-Z][\w-]*)/)?.[1]?.toLowerCase() ?? ''
}

function isOpeningTag(token: string) {
  return /^<[a-zA-Z]/.test(token) && !token.endsWith('/>')
}

function isClosingTag(token: string) {
  return /^<\//.test(token)
}

/**
 * Formats the small HTML snippets used by the CSS track in Code Quest.
 * It intentionally changes presentation only; the original HTML is still
 * passed to the preview frame without modification.
 */
export function formatHtml(html: string, indentSize = 2) {
  const compact = html.trim().replace(/>\s+</g, '><')
  const tokens = compact.match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[^>]+>|[^<]+/g) ?? []
  const lines: string[] = []
  let depth = 0
  const indent = () => ' '.repeat(Math.max(0, depth) * indentSize)

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index].trim()
    if (!token) continue

    const next = tokens[index + 1]?.trim()
    const afterNext = tokens[index + 2]?.trim()

    // Keep simple text-only elements compact, as VS Code does.
    if (
      isOpeningTag(token) &&
      !VOID_ELEMENTS.has(tagName(token)) &&
      next &&
      !next.startsWith('<') &&
      afterNext &&
      isClosingTag(afterNext) &&
      tagName(token) === tagName(afterNext)
    ) {
      lines.push(`${indent()}${token}${next}${afterNext}`)
      index += 2
      continue
    }

    if (isClosingTag(token)) depth = Math.max(0, depth - 1)
    lines.push(`${indent()}${token}`)

    if (isOpeningTag(token) && !VOID_ELEMENTS.has(tagName(token))) depth += 1
  }

  return lines.join('\n')
}
