import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const catalogPath = process.argv[2] ?? '/problems/selector.json'
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const failures = []

try {
  for (const problem of catalog.problems) {
    await page.setContent(`<!doctype html><body>${problem.html}</body>`)
    const result = await page.evaluate(selector => {
      try {
        const targets = new Set(document.querySelectorAll('[data-target]'))
        const selected = new Set(document.querySelectorAll(selector))
        return {
          valid: true,
          matched: targets.size === selected.size
            && [...targets].every(element => selected.has(element)),
          targetCount: targets.size,
          selectedCount: selected.size
        }
      } catch {
        return { valid: false, matched: false, targetCount: 0, selectedCount: 0 }
      }
    }, problem.answer)

    if (!result.valid || !result.matched) {
      failures.push({ number: problem.id, answer: problem.answer, ...result })
    }
  }
} finally {
  await browser.close()
}

if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2))
  process.exitCode = 1
} else {
  console.log(`선택자 문제 ${catalog.problems.length}개가 모두 Chromium 목표 요소 검증을 통과했습니다.`)
}
