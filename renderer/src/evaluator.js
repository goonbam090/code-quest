import { createHash } from 'node:crypto'
import * as csstree from 'css-tree'
import { chromium } from 'playwright'

const VIEWPORT = { width: 800, height: 600 }
const MAX_CSS_LENGTH = 20_000
const MAX_HTML_LENGTH = 200_000
const MAX_RENDER_WIDTH = 4_000
const MAX_RENDER_HEIGHT = 6_000
const MAX_VIEWPORT_WIDTH = 1_920
const MAX_VIEWPORT_HEIGHT = 1_200
const MAX_VIEWPORTS = 4
const MAX_STATE_SCENARIOS = 4
const MAX_SCENARIO_RUNS = 12
const MAX_SCENARIO_SELECTOR_LENGTH = 500
const MAX_STYLESHEET_ELEMENTS = 500
const MAX_STYLESHEET_EVALUATION_MS = 7_000
const ALLOWED_STYLESHEET_AT_RULES = new Set([
  'container',
  'keyframes',
  '-webkit-keyframes',
  'layer',
  'media',
  'scope',
  'starting-style',
  'supports'
])

class RenderLimitError extends RangeError {
  constructor(message) {
    super(message)
    this.name = 'RenderLimitError'
  }
}

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

const STABLE_RENDER_CSS = `
  *, *::before, *::after {
    animation-delay: 0s !important;
    animation-duration: 0s !important;
    caret-color: transparent !important;
    transition-delay: 0s !important;
    transition-duration: 0s !important;
  }
`
const STYLESHEET_BASE_CSS = 'body { padding: 0; }'

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

function splitCssList(value) {
  const items = []
  let current = ''
  let quote = ''
  let escaped = false
  let depth = 0
  for (const character of String(value ?? '')) {
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
    if (character === ',' && depth === 0) {
      items.push(current.trim())
      current = ''
    } else {
      current += character
    }
  }
  if (current.trim()) items.push(current.trim())
  return items
}

function normalizeTemporalComputed(target) {
  const normalizedTarget = { ...target }
  const families = [
    {
      anchor: 'transition-property',
      properties: [
        'transition-property',
        'transition-duration',
        'transition-timing-function',
        'transition-delay',
        'transition-behavior'
      ]
    },
    {
      anchor: 'animation-name',
      properties: [
        'animation-name',
        'animation-duration',
        'animation-timing-function',
        'animation-delay',
        'animation-iteration-count',
        'animation-direction',
        'animation-fill-mode',
        'animation-play-state',
        'animation-timeline',
        'animation-range-start',
        'animation-range-end'
      ]
    }
  ]
  for (const family of families) {
    const count = splitCssList(normalizedTarget[family.anchor]).length
    if (count < 2) continue
    for (const property of family.properties) {
      if (!(property in normalizedTarget)) continue
      const values = splitCssList(normalizedTarget[property])
      if (values.length === 0 || values.length === count) continue
      normalizedTarget[property] = Array.from(
        { length: count },
        (_, index) => values[index % values.length]
      ).join(', ')
    }
  }
  return normalizedTarget
}

function computedDifferences(expected, actual, propertyNames = null) {
  const differences = []
  const includedProperties = propertyNames == null ? null : new Set(propertyNames)
  for (let targetIndex = 0; targetIndex < expected.computed.length; targetIndex += 1) {
    const expectedTarget = normalizeTemporalComputed(expected.computed[targetIndex])
    const actualTarget = normalizeTemporalComputed(actual.computed[targetIndex] ?? {})
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

function stylesheetSyntaxResult(diagnosticCode = 'MALFORMED_DECLARATION', details = {}) {
  return {
    syntaxValid: false,
    matched: false,
    matchType: 'NONE',
    visualMatch: false,
    computedMatch: false,
    differingProperty: null,
    diagnosticCode,
    diagnosticProperty: details.diagnosticProperty ?? null,
    diagnosticValue: details.diagnosticValue ?? null,
    suggestedValue: details.suggestedValue ?? null
  }
}

function stylesheetMismatchResult() {
  return {
    syntaxValid: true,
    matched: false,
    matchType: 'NONE',
    visualMatch: false,
    computedMatch: false,
    differingProperty: null,
    diagnosticCode: 'RESULT_MISMATCH',
    diagnosticProperty: null,
    diagnosticValue: null,
    suggestedValue: null
  }
}

function analyzeStylesheetSource(value) {
  const parseErrors = []
  let ast
  try {
    ast = csstree.parse(value, {
      positions: true,
      onParseError: error => parseErrors.push(error.message)
    })
  } catch (error) {
    return {
      valid: false,
      diagnosticCode: 'MALFORMED_DECLARATION',
      diagnostic: error instanceof Error ? error.message : String(error),
      declarations: []
    }
  }

  const declarations = []
  const unsupportedAtRules = []
  const blockedUrls = []
  csstree.walk(ast, node => {
    if (node.type === 'Atrule') {
      const name = node.name.toLowerCase()
      if (!ALLOWED_STYLESHEET_AT_RULES.has(name)) unsupportedAtRules.push(name)
      return
    }
    if (node.type === 'Url') {
      const url = node.value.trim()
      if (!url.startsWith('#') && !url.toLowerCase().startsWith('data:')) {
        blockedUrls.push(url)
      }
      return
    }
    if (node.type !== 'Declaration') return
    declarations.push({
      property: node.property,
      value: csstree.generate(node.value),
      important: node.important === true
    })
  })

  if (parseErrors.length > 0 || unsupportedAtRules.length > 0
      || blockedUrls.length > 0 || declarations.length === 0) {
    return {
      valid: false,
      diagnosticCode: blockedUrls.length > 0 ? 'FORBIDDEN_RESOURCE' : 'MALFORMED_DECLARATION',
      diagnostic: parseErrors[0]
        ?? (blockedUrls.length > 0
          ? `외부 URL은 사용할 수 없습니다: ${blockedUrls[0]}`
          : null)
        ?? `지원하지 않는 @${unsupportedAtRules[0]} 규칙입니다.`,
      declarations: []
    }
  }
  return {
    valid: true,
    diagnosticCode: 'NONE',
    diagnostic: null,
    declarations
  }
}

function hasBalancedStylesheetDelimiters(value) {
  const stack = []
  let quote = ''
  let escaped = false
  let comment = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    const next = value[index + 1]
    if (comment) {
      if (character === '*' && next === '/') {
        comment = false
        index += 1
      }
      continue
    }
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = ''
      continue
    }
    if (character === '/' && next === '*') {
      comment = true
      index += 1
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === '(' || character === '[' || character === '{') {
      stack.push(character)
    } else if (character === ')' || character === ']' || character === '}') {
      const open = stack.pop()
      if ((open === '(' && character !== ')')
        || (open === '[' && character !== ']')
        || (open === '{' && character !== '}')
        || open == null) {
        return false
      }
    }
  }
  return !comment && !quote && !escaped && stack.length === 0
}

function normalizeViewports(value) {
  if (value == null) return [VIEWPORT]
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_VIEWPORTS) {
    throw new RangeError(`viewports는 1개 이상 ${MAX_VIEWPORTS}개 이하의 배열이어야 합니다.`)
  }

  const seen = new Set()
  const viewports = []
  for (const viewport of value) {
    if (viewport == null || typeof viewport !== 'object' || Array.isArray(viewport)) {
      throw new TypeError('각 viewport에는 width와 height 정수가 필요합니다.')
    }
    const { width, height } = viewport
    if (!Number.isInteger(width) || !Number.isInteger(height)
      || width < 1 || width > MAX_VIEWPORT_WIDTH
      || height < 1 || height > MAX_VIEWPORT_HEIGHT) {
      throw new RangeError(
        `viewport width는 1~${MAX_VIEWPORT_WIDTH}, height는 1~${MAX_VIEWPORT_HEIGHT} 정수여야 합니다.`
      )
    }
    const key = `${width}x${height}`
    if (!seen.has(key)) {
      seen.add(key)
      viewports.push({ width, height })
    }
  }
  return viewports
}

function normalizeScenarioSelectors(value, state) {
  if (value == null) return []
  const candidates = Array.isArray(value) ? value : [value]
  return candidates.map(candidate => {
    const selector = typeof candidate === 'string' ? candidate : candidate?.selector
    if (typeof selector !== 'string' || selector.trim().length === 0) {
      throw new TypeError(`${state} 시나리오에는 비어 있지 않은 selector 문자열이 필요합니다.`)
    }
    if (selector.length > MAX_SCENARIO_SELECTOR_LENGTH) {
      throw new RangeError(`${state} selector가 허용 길이를 초과했습니다.`)
    }
    return { state, selector: selector.trim() }
  })
}

function normalizeStylesheetValidation(validation) {
  if (validation == null) {
    return { viewports: [VIEWPORT], scenarios: [{ state: 'default', selector: null }] }
  }
  if (typeof validation !== 'object' || Array.isArray(validation)) {
    throw new TypeError('stylesheet validation은 객체여야 합니다.')
  }

  const viewports = normalizeViewports(validation.viewports)
  const stateScenarios = [
    ...normalizeScenarioSelectors(validation.focus, 'focus'),
    ...normalizeScenarioSelectors(validation.hover, 'hover')
  ]
  if (stateScenarios.length > MAX_STATE_SCENARIOS) {
    throw new RangeError(`hover와 focus 시나리오는 합쳐서 ${MAX_STATE_SCENARIOS}개 이하여야 합니다.`)
  }
  const scenarios = [{ state: 'default', selector: null }, ...stateScenarios]
  if (viewports.length * scenarios.length > MAX_SCENARIO_RUNS) {
    throw new RangeError(`viewport와 상태의 조합은 ${MAX_SCENARIO_RUNS}개 이하여야 합니다.`)
  }
  return { viewports, scenarios }
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

async function parseStylesheet(page, css, sourceDeclarations) {
  return page.evaluate(({ input, declarations }) => {
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

    if (input.trim().length === 0) {
      return { valid: false, diagnosticCode: 'MALFORMED_DECLARATION' }
    }

    for (const declaration of declarations) {
      const customProperty = declaration.property.startsWith('--')
      if (!customProperty && !CSS.supports(declaration.property, 'initial')) {
        return {
          valid: false,
          diagnosticCode: 'UNKNOWN_PROPERTY',
          diagnosticProperty: declaration.property,
          diagnosticValue: declaration.value,
          suggestedValue: null
        }
      }
      if (!customProperty && !CSS.supports(declaration.property, declaration.value)) {
        const suggestedValue = missingUnitSuggestion(declaration.property, declaration.value)
        return {
          valid: false,
          diagnosticCode: suggestedValue ? 'MISSING_UNIT' : 'INVALID_PROPERTY_VALUE',
          diagnosticProperty: declaration.property,
          diagnosticValue: declaration.value,
          suggestedValue
        }
      }
      const probe = document.createElement('div').style
      probe.setProperty(
        declaration.property,
        declaration.value,
        declaration.important ? 'important' : ''
      )
      if (probe.getPropertyValue(declaration.property).trim().length === 0) {
        return {
          valid: false,
          diagnosticCode: customProperty ? 'MALFORMED_DECLARATION' : 'INVALID_PROPERTY_VALUE',
          diagnosticProperty: declaration.property,
          diagnosticValue: declaration.value,
          suggestedValue: null
        }
      }
    }

    const sheet = new CSSStyleSheet()
    try {
      sheet.replaceSync(input)
    } catch {
      return { valid: false, diagnosticCode: 'MALFORMED_DECLARATION' }
    }

    let styleRuleCount = 0
    let invalidRuleCount = 0
    const visit = rules => {
      for (const rule of rules) {
        if (rule instanceof CSSImportRule) {
          invalidRuleCount += 1
          continue
        }
        if (rule instanceof CSSStyleRule) {
          styleRuleCount += 1
          if (rule.style.length === 0 && (!rule.cssRules || rule.cssRules.length === 0)) {
            invalidRuleCount += 1
          }
        }
        if (rule.cssRules) visit(rule.cssRules)
      }
    }
    visit(sheet.cssRules)
    return {
      valid: styleRuleCount > 0 && invalidRuleCount === 0,
      diagnosticCode: invalidRuleCount > 0 ? 'MALFORMED_DECLARATION' : 'NONE'
    }
  }, { input: css, declarations: sourceDeclarations })
}

async function setDocument(page, html) {
  await page.setContent(`<!doctype html><html><head></head><body>${html}</body></html>`, {
    waitUntil: 'domcontentloaded',
    timeout: 5_000
  })
  await page.addStyleTag({ content: BASE_CSS })
}

async function renderDeclarations(page, html, declarations, properties) {
  await setDocument(page, html)
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

  // Preserve the authored transition/animation semantics before the
  // deterministic screenshot stylesheet sets temporal values to 0s.
  const computed = await page.evaluate(propertyNames => {
    const targets = Array.from(document.querySelectorAll('[data-preview]'))
    return targets.map(target => {
      const style = getComputedStyle(target)
      return Object.fromEntries(propertyNames.map(property => [
        property,
        style.getPropertyValue(property).trim()
      ]))
    })
  }, properties)

  await page.addStyleTag({ content: STABLE_RENDER_CSS })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))

  const snapshot = await page.evaluate(() => {
    const targets = Array.from(document.querySelectorAll('[data-preview]'))
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
      geometry,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight
    }
  })

  if (snapshot.documentWidth > MAX_RENDER_WIDTH || snapshot.documentHeight > MAX_RENDER_HEIGHT) {
    throw new RenderLimitError(
      `렌더링 결과가 허용 크기 ${MAX_RENDER_WIDTH}x${MAX_RENDER_HEIGHT}px를 초과했습니다.`
    )
  }
  const screenshot = await page.screenshot({
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    timeout: 5_000
  })
  return { ...snapshot, computed, pixelHash: sha256(screenshot) }
}

async function setStylesheetDocument(page, html, stylesheet) {
  await setDocument(page, html)
  await page.addStyleTag({ content: STYLESHEET_BASE_CSS })
  await page.addStyleTag({ content: stylesheet })
  await page.addStyleTag({ content: STABLE_RENDER_CSS })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

async function activateScenario(page, scenario, viewport) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  })
  await page.mouse.move(viewport.width + 10, viewport.height + 10)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)))
  if (scenario.state === 'default') return true

  let count
  try {
    count = await page.locator(scenario.selector).count()
  } catch {
    throw new TypeError(`${scenario.state} selector가 유효한 CSS 선택자가 아닙니다.`)
  }
  if (count !== 1) {
    throw new TypeError(
      `${scenario.state} selector는 정확히 한 요소와 일치해야 합니다. 현재 ${count}개와 일치합니다.`
    )
  }

  try {
    const target = page.locator(scenario.selector)
    if (scenario.state === 'hover') {
      await target.hover({ timeout: 750 })
    } else {
      const focused = await target.evaluate(element => {
        element.focus({ preventScroll: true, focusVisible: true })
        return document.activeElement === element
      })
      if (!focused) return false
    }
    await page.evaluate(() => new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))))
    return true
  } catch {
    return false
  }
}

async function stylesheetSnapshot(page) {
  const snapshot = await page.evaluate(() => {
    const elements = [
      document.documentElement,
      document.body,
      ...document.body.querySelectorAll('*')
    ]
    const serializeStyle = style => Object.fromEntries(
      Array.from(style)
        .filter(property => !property.startsWith('--'))
        .map(property => [property, style.getPropertyValue(property)])
    )
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
    const computed = elements.map(element => ({
      normal: serializeStyle(getComputedStyle(element)),
      before: serializeStyle(getComputedStyle(element, '::before')),
      after: serializeStyle(getComputedStyle(element, '::after'))
    }))
    return {
      geometry,
      computed,
      elementCount: elements.length,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight
    }
  })

  if (snapshot.elementCount > MAX_STYLESHEET_ELEMENTS) {
    throw new RenderLimitError(
      `stylesheet 채점 요소 수가 허용값 ${MAX_STYLESHEET_ELEMENTS}개를 초과했습니다.`
    )
  }
  if (snapshot.documentWidth > MAX_RENDER_WIDTH || snapshot.documentHeight > MAX_RENDER_HEIGHT) {
    throw new RenderLimitError(
      `렌더링 결과가 허용 크기 ${MAX_RENDER_WIDTH}x${MAX_RENDER_HEIGHT}px를 초과했습니다.`
    )
  }
  return snapshot
}

async function stylesheetPixelHash(page) {
  const screenshot = await page.screenshot({
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    timeout: 5_000
  })
  return sha256(screenshot)
}

function sameStylesheetGeometry(expected, actual) {
  return expected.documentWidth === actual.documentWidth
    && expected.documentHeight === actual.documentHeight
    && sameGeometry(expected.geometry, actual.geometry)
}

function sameStylesheetComputed(expected, actual) {
  return JSON.stringify(expected.computed) === JSON.stringify(actual.computed)
}

async function withStylesheetDeadline(timeoutMs, task) {
  let timer
  let timedOut = false
  let context = null
  const registerContext = nextContext => {
    context = nextContext
    if (timedOut) void context.close().catch(() => {})
  }
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      if (context) void context.close().catch(() => {})
      reject(new Error('stylesheet 채점 제한 시간을 초과했습니다.'))
    }, timeoutMs)
  })

  try {
    return await Promise.race([task(registerContext), deadline])
  } catch (error) {
    if (timedOut) throw new Error('stylesheet 채점 제한 시간을 초과했습니다.')
    throw error
  } finally {
    clearTimeout(timer)
    if (context && !timedOut) await context.close().catch(() => {})
  }
}

export class CssEvaluator {
  constructor({ stylesheetTimeoutMs = MAX_STYLESHEET_EVALUATION_MS } = {}) {
    if (!Number.isInteger(stylesheetTimeoutMs) || stylesheetTimeoutMs < 1) {
      throw new RangeError('stylesheetTimeoutMs는 1 이상의 정수여야 합니다.')
    }
    this.browserPromise = null
    this.stylesheetTimeoutMs = stylesheetTimeoutMs
  }

  async browser() {
    if (!this.browserPromise) {
      const launchPromise = chromium.launch({ headless: true })
      this.browserPromise = launchPromise
      void launchPromise.then(browser => {
        browser.once('disconnected', () => {
          if (this.browserPromise === launchPromise) this.browserPromise = null
        })
      }, () => {
        if (this.browserPromise === launchPromise) this.browserPromise = null
      })
    }
    return this.browserPromise
  }

  async healthy() {
    try {
      const browser = await this.browser()
      return browser.isConnected()
    } catch {
      return false
    }
  }

  async close() {
    if (!this.browserPromise) return
    const browserPromise = this.browserPromise
    this.browserPromise = null
    try {
      const browser = await browserPromise
      await browser.close()
    } catch {
      // A failed or disconnected browser is already considered closed.
    }
  }

  async evaluate({
    html,
    expectedCss,
    actualCss,
    policy = 'computed',
    mode = 'declaration',
    validation = null
  }) {
    if (typeof html !== 'string' || typeof expectedCss !== 'string' || typeof actualCss !== 'string') {
      throw new TypeError('html, expectedCss, actualCss는 문자열이어야 합니다.')
    }
    if (html.length > MAX_HTML_LENGTH || expectedCss.length > MAX_CSS_LENGTH || actualCss.length > MAX_CSS_LENGTH) {
      throw new RangeError('채점 입력의 허용 크기를 초과했습니다.')
    }
    if (mode === 'stylesheet') {
      return this.evaluateStylesheet({ html, expectedCss, actualCss, validation })
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
      const expected = await renderDeclarations(
        expectedPage,
        html,
        expectedParse.declarations,
        comparedProperties
      )
      await expectedPage.close()

      const actualPage = await context.newPage()
      let actual
      try {
        actual = await renderDeclarations(
          actualPage,
          html,
          actualParse.declarations,
          comparedProperties
        )
      } catch (error) {
        if (error instanceof RenderLimitError) return stylesheetSyntaxResult('RENDER_LIMIT')
        throw error
      } finally {
        await actualPage.close()
      }

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

  async evaluateStylesheet({ html, expectedCss, actualCss, validation }) {
    if (!hasBalancedStylesheetDelimiters(expectedCss)) {
      throw new Error('기준 답안 stylesheet의 괄호 또는 주석이 닫히지 않았습니다.')
    }
    if (!hasBalancedStylesheetDelimiters(actualCss)) {
      return stylesheetSyntaxResult()
    }
    const expectedSource = analyzeStylesheetSource(expectedCss)
    if (!expectedSource.valid) {
      throw new Error(`기준 답안 stylesheet 구문이 유효하지 않습니다: ${expectedSource.diagnostic}`)
    }
    const actualSource = analyzeStylesheetSource(actualCss)
    if (!actualSource.valid) {
      return stylesheetSyntaxResult(actualSource.diagnosticCode)
    }
    const grading = normalizeStylesheetValidation(validation)
    const identicalStylesheets = expectedCss === actualCss

    return withStylesheetDeadline(this.stylesheetTimeoutMs, async registerContext => {
      const browser = await this.browser()
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 1,
        locale: 'ko-KR',
        colorScheme: 'dark',
        reducedMotion: 'reduce'
      })
      registerContext(context)
      context.setDefaultTimeout(5_000)
      await context.route('**/*', route => {
        const url = route.request().url()
        if (url.startsWith('data:') || url.startsWith('about:')) route.continue()
        else route.abort()
      })

      const parserPage = await context.newPage()
      const expectedParse = await parseStylesheet(
        parserPage,
        expectedCss,
        expectedSource.declarations
      )
      const actualParse = identicalStylesheets
        ? expectedParse
        : await parseStylesheet(
          parserPage,
          actualCss,
          actualSource.declarations
        )
      await parserPage.close()

      if (!expectedParse.valid) {
        throw new Error('기준 답안 stylesheet가 브라우저에서 유효하지 않습니다.')
      }
      if (!actualParse.valid) {
        return stylesheetSyntaxResult(actualParse.diagnosticCode, {
          diagnosticProperty: actualParse.diagnosticProperty,
          diagnosticValue: actualParse.diagnosticValue,
          suggestedValue: actualParse.suggestedValue
        })
      }

      for (const viewport of grading.viewports) {
        const page = await context.newPage()
        try {
          await page.setViewportSize(viewport)

          for (const scenario of grading.scenarios) {
            await setStylesheetDocument(page, html, expectedCss)
            const expectedActive = await activateScenario(page, scenario, viewport)
            if (!expectedActive) {
              throw new Error(`기준 답안에서 ${scenario.state} 시나리오를 적용할 수 없습니다.`)
            }
            const expected = await stylesheetSnapshot(page)
            if (identicalStylesheets) continue

            await setStylesheetDocument(page, html, actualCss)
            const actualActive = await activateScenario(page, scenario, viewport)
            if (!actualActive) return stylesheetMismatchResult()
            let actual
            try {
              actual = await stylesheetSnapshot(page)
            } catch (error) {
              if (error instanceof RenderLimitError) return stylesheetSyntaxResult('RENDER_LIMIT')
              throw error
            }
            if (!sameStylesheetGeometry(expected, actual)) return stylesheetMismatchResult()
            if (sameStylesheetComputed(expected, actual)) continue

            const actualPixelHash = await stylesheetPixelHash(page)
            await setStylesheetDocument(page, html, expectedCss)
            const restoredExpectedActive = await activateScenario(page, scenario, viewport)
            if (!restoredExpectedActive) {
              throw new Error(`기준 답안에서 ${scenario.state} 시나리오를 적용할 수 없습니다.`)
            }
            const restoredExpected = await stylesheetSnapshot(page)
            if (!sameStylesheetGeometry(expected, restoredExpected)
                || !sameStylesheetComputed(expected, restoredExpected)) {
              throw new Error('기준 답안 stylesheet의 렌더링 결과가 평가 중 달라졌습니다.')
            }
            const expectedPixelHash = await stylesheetPixelHash(page)
            if (expectedPixelHash !== actualPixelHash) return stylesheetMismatchResult()
          }
        } finally {
          await page.close()
        }
      }

      return {
        syntaxValid: true,
        matched: true,
        matchType: 'VISUAL',
        visualMatch: true,
        computedMatch: false,
        differingProperty: null,
        diagnosticCode: 'NONE',
        diagnosticProperty: null,
        diagnosticValue: null,
        suggestedValue: null
      }
    })
  }
}
