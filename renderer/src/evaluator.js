import { createHash } from 'node:crypto'
import { chromium } from 'playwright'

const VIEWPORT = { width: 800, height: 600 }
const MAX_CSS_LENGTH = 20_000
const MAX_HTML_LENGTH = 200_000
const MAX_RENDER_WIDTH = 4_000
const MAX_RENDER_HEIGHT = 6_000

const BASE_CSS = `
  :root { color-scheme: dark; }
  *:not([data-preview]) { box-sizing: border-box; }
  html { background: #121017; }
  body {
    margin: 0;
    padding: 24px;
    font: 15px/1.5 system-ui;
    color: #e8e3f0;
    background: #121017;
  }
  :where([data-preview], .demo, .flex-box, .grid-box) {
    padding: 18px;
    border: 1px dashed #5c5668;
    border-radius: 12px;
    background: #1b1822;
  }
  :where(.flex-box span, .grid-box span) {
    display: inline-block;
    padding: 10px;
    margin: 3px;
    background: #25212e;
    border: 1px solid #403a49;
    border-radius: 8px;
  }
  input, button, select, textarea {
    color: #eee;
    background: #25212e;
    border: 1px solid #4a4454;
    border-radius: 6px;
    padding: 8px;
  }
  a { color: #ad9cff; }
`

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function equalNumber(left, right) {
  return Math.abs(left - right) <= 0.25
}

function sameGeometry(left, right) {
  if (left.length !== right.length) return false
  return left.every((item, index) => {
    const other = right[index]
    return item.tag === other.tag
      && equalNumber(item.x, other.x)
      && equalNumber(item.y, other.y)
      && equalNumber(item.width, other.width)
      && equalNumber(item.height, other.height)
      && item.scrollWidth === other.scrollWidth
      && item.scrollHeight === other.scrollHeight
  })
}

function computedDifferences(expected, actual, propertyNames = null) {
  const differences = []
  const includedProperties = propertyNames == null ? null : new Set(propertyNames)
  for (let targetIndex = 0; targetIndex < expected.computed.length; targetIndex += 1) {
    const expectedTarget = expected.computed[targetIndex]
    const actualTarget = actual.computed[targetIndex] ?? {}
    for (const [property, expectedValue] of Object.entries(expectedTarget)) {
      if (includedProperties != null && !includedProperties.has(property)) continue
      const actualValue = actualTarget[property] ?? ''
      if (expectedValue !== actualValue) {
        differences.push({ targetIndex, property, expectedValue, actualValue })
      }
    }
  }
  return differences
}

async function parseDeclarations(page, css) {
  return page.evaluate(input => {
    const replaceBareNumbers = (value, unit) => {
      let changed = false
      const candidate = value.replace(
        /(^|[^\w.%#])(-?(?:\d+\.?\d*|\.\d+))(?=$|[^\w.%])/g,
        (match, prefix, number) => {
          if (Number(number) === 0) return match
          changed = true
          return `${prefix}${number}${unit}`
        }
      )
      return changed ? candidate : null
    }

    const missingUnitSuggestion = (property, value) => {
      for (const unit of ['px', 'rem', '%', 'deg', 's']) {
        const candidate = replaceBareNumbers(value, unit)
        if (candidate && CSS.supports(property, candidate)) return candidate
      }
      return null
    }

    const splitDeclarations = value => {
      const declarations = []
      let current = ''
      let quote = ''
      let escaped = false
      let depth = 0

      for (const character of value) {
        if (escaped) {
          current += character
          escaped = false
          continue
        }
        if (character === '\\') {
          current += character
          escaped = true
          continue
        }
        if (quote) {
          current += character
          if (character === quote) quote = ''
          continue
        }
        if (character === '"' || character === "'") {
          quote = character
          current += character
          continue
        }
        if (character === '(' || character === '[') depth += 1
        if (character === ')' || character === ']') depth -= 1
        if (character === ';' && depth === 0) {
          if (current.trim()) declarations.push(current.trim())
          current = ''
        } else {
          current += character
        }
      }
      if (current.trim()) declarations.push(current.trim())
      return declarations
    }

    const declarations = splitDeclarations(input)
    const style = document.createElement('div').style
    const diagnostics = []

    for (const declaration of declarations) {
      const colon = declaration.indexOf(':')
      if (colon <= 0) {
        diagnostics.push({
          code: 'MALFORMED_DECLARATION',
          property: null,
          value: declaration,
          suggestedValue: null
        })
        continue
      }
      const property = declaration.slice(0, colon).trim()
      const rawValue = declaration.slice(colon + 1).trim()
      const important = /\s*!important\s*$/i.test(rawValue)
      const value = important ? rawValue.replace(/\s*!important\s*$/i, '').trim() : rawValue
      if (!property || !value) {
        diagnostics.push({
          code: 'MALFORMED_DECLARATION',
          property: property || null,
          value,
          suggestedValue: null
        })
        continue
      }

      const customProperty = property.startsWith('--')
      const knownProperty = customProperty || CSS.supports(property, 'initial')
      if (!knownProperty) {
        diagnostics.push({
          code: 'UNKNOWN_PROPERTY',
          property,
          value,
          suggestedValue: null
        })
        continue
      }

      if (!customProperty && !CSS.supports(property, value)) {
        const suggestedValue = missingUnitSuggestion(property, value)
        diagnostics.push({
          code: suggestedValue ? 'MISSING_UNIT' : 'INVALID_PROPERTY_VALUE',
          property,
          value,
          suggestedValue
        })
        continue
      }

      style.setProperty(property, value, important ? 'important' : '')
    }

    return {
      valid: declarations.length > 0 && diagnostics.length === 0 && style.length > 0,
      properties: Array.from(style),
      declarations: Array.from(style, property => ({
        property,
        value: style.getPropertyValue(property),
        priority: style.getPropertyPriority(property)
      })),
      diagnostics
    }
  }, css)
}

async function render(page, html, declarations, properties) {
  await page.setContent(`<!doctype html><html><head></head><body>${html}</body></html>`, {
    waitUntil: 'domcontentloaded',
    timeout: 5_000
  })
  await page.addStyleTag({ content: BASE_CSS })
  await page.evaluate(parsedDeclarations => {
    for (const target of document.querySelectorAll('[data-preview]')) {
      for (const declaration of parsedDeclarations) {
        target.style.setProperty(
          declaration.property,
          declaration.value,
          declaration.priority
        )
      }
    }
  }, declarations)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))

  const snapshot = await page.evaluate(propertyNames => {
    const targets = Array.from(document.querySelectorAll('[data-preview]'))
    const computed = targets.map(target => {
      const style = getComputedStyle(target)
      return Object.fromEntries(propertyNames.map(property => [
        property,
        style.getPropertyValue(property).trim()
      ]))
    })
    const elements = Array.from(document.body.querySelectorAll('*'))
    const geometry = elements.map(element => {
      const rect = element.getBoundingClientRect()
      return {
        tag: element.tagName,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight
      }
    })
    return {
      targetCount: targets.length,
      computed,
      geometry,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight
    }
  }, properties)

  if (snapshot.documentWidth > MAX_RENDER_WIDTH || snapshot.documentHeight > MAX_RENDER_HEIGHT) {
    throw new RangeError(
      `렌더링 결과가 허용 크기 ${MAX_RENDER_WIDTH}x${MAX_RENDER_HEIGHT}px를 초과했습니다.`
    )
  }
  const screenshot = await page.screenshot({
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    timeout: 5_000
  })
  return { ...snapshot, pixelHash: sha256(screenshot) }
}

export class CssEvaluator {
  constructor() {
    this.browserPromise = null
  }

  async browser() {
    if (!this.browserPromise) {
      this.browserPromise = chromium.launch({ headless: true })
    }
    return this.browserPromise
  }

  async close() {
    if (!this.browserPromise) return
    const browser = await this.browserPromise
    await browser.close()
    this.browserPromise = null
  }

  async evaluate({ html, expectedCss, actualCss, policy = 'computed' }) {
    if (typeof html !== 'string' || typeof expectedCss !== 'string' || typeof actualCss !== 'string') {
      throw new TypeError('html, expectedCss, actualCss는 문자열이어야 합니다.')
    }
    if (html.length > MAX_HTML_LENGTH || expectedCss.length > MAX_CSS_LENGTH || actualCss.length > MAX_CSS_LENGTH) {
      throw new RangeError('채점 입력의 허용 크기를 초과했습니다.')
    }

    const browser = await this.browser()
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      locale: 'ko-KR',
      colorScheme: 'dark',
      reducedMotion: 'reduce'
    })
    context.setDefaultTimeout(5_000)
    await context.route('**/*', route => {
      const url = route.request().url()
      if (url.startsWith('data:') || url.startsWith('about:')) route.continue()
      else route.abort()
    })

    try {
      const parserPage = await context.newPage()
      const expectedParse = await parseDeclarations(parserPage, expectedCss)
      const actualParse = await parseDeclarations(parserPage, actualCss)
      await parserPage.close()

      if (!expectedParse.valid) {
        throw new Error(`기준 답안 CSS가 브라우저에서 유효하지 않습니다: ${JSON.stringify(expectedParse.diagnostics)}`)
      }
      if (!actualParse.valid) {
        const diagnostic = actualParse.diagnostics[0] ?? {
          code: 'MALFORMED_DECLARATION',
          property: null,
          value: null,
          suggestedValue: null
        }
        return {
          syntaxValid: false,
          matched: false,
          matchType: 'NONE',
          visualMatch: false,
          computedMatch: false,
          differingProperty: diagnostic.property,
          diagnosticCode: diagnostic.code,
          diagnosticProperty: diagnostic.property,
          diagnosticValue: diagnostic.value,
          suggestedValue: diagnostic.suggestedValue
        }
      }

      const comparedProperties = Array.from(new Set([
        ...expectedParse.properties,
        ...actualParse.properties
      ]))
      const expectedPage = await context.newPage()
      const expected = await render(
        expectedPage,
        html,
        expectedParse.declarations,
        comparedProperties
      )
      await expectedPage.close()

      const actualPage = await context.newPage()
      const actual = await render(
        actualPage,
        html,
        actualParse.declarations,
        comparedProperties
      )
      await actualPage.close()

      if (expected.targetCount === 0) {
        throw new Error('data-preview 대상 요소가 없습니다.')
      }

      const differences = computedDifferences(
        expected,
        actual,
        expectedParse.properties
      )
      const renderDifferences = computedDifferences(
        expected,
        actual,
        comparedProperties
      )
      const computedMatch = differences.length === 0
      const visualMatch = expected.pixelHash === actual.pixelHash
        && sameGeometry(expected.geometry, actual.geometry)
      const visualPolicy = policy === 'visual'
      const matched = visualPolicy
        ? visualMatch
        : renderDifferences.length === 0
          && sameGeometry(expected.geometry, actual.geometry)
      const differingProperty = (differences[0] ?? renderDifferences[0])?.property ?? null
      let diagnosticCode = 'NONE'
      if (!matched) {
        diagnosticCode = differingProperty == null
          ? 'RESULT_MISMATCH'
          : actualParse.properties.includes(differingProperty)
            ? 'VALUE_MISMATCH'
            : 'MISSING_REQUIRED_PROPERTY'
      }

      return {
        syntaxValid: true,
        matched,
        matchType: matched ? (computedMatch ? 'COMPUTED' : 'VISUAL') : 'NONE',
        visualMatch,
        computedMatch,
        differingProperty,
        diagnosticCode,
        diagnosticProperty: differingProperty,
        diagnosticValue: null,
        suggestedValue: null
      }
    } finally {
      await context.close()
    }
  }
}
