import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import builder from '../../../docs/benchmarks-builder-final.json' with { type: 'json' }

const runtimeURL = /\/assets\/(?:chunks\/)?performance-echarts[^/]*\.js(?:\?.*)?$/
const tableIds = [
  'scan-table',
  'version-table',
  'native-version-table',
  'build-table',
  'retained-table',
  'version-memory-table',
  'stream-table',
]

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  return errors
}

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test('performance tables are server rendered and share the same bilingual measurements', async ({ page }) => {
  // Parsing the response, rather than the hydrated document, verifies that the
  // actual measurements remain available with JavaScript or ECharts disabled.
  await page.goto('/api')
  const snapshots: { id: string, rows: string[], values: string[] }[][] = []
  for (const prefix of ['', '/zh']) {
    const response = await page.request.get(`${prefix}/extensions/performance`)
    expect(response.status()).toBe(200)
    const tables = await page.evaluate(({ html, ids }) => {
      const document = new DOMParser().parseFromString(html, 'text/html')
      return ids.map((id) => {
        const table = document.querySelector(`[data-testid="${id}"]`)
        return {
          id,
          rows: [...(table?.querySelectorAll('tbody tr') ?? [])].map(row => row.getAttribute('data-row-key') ?? ''),
          values: [...(table?.querySelectorAll('[data-value]') ?? [])].map(cell => cell.getAttribute('data-value')!),
        }
      })
    }, { html: await response.text(), ids: tableIds })
    for (const table of tables) {
      expect(table.rows.length, table.id).toBeGreaterThan(0)
      expect(table.values.length, table.id).toBeGreaterThan(0)
      expect(table.rows.every(Boolean), table.id).toBe(true)
    }
    expect(tables.find(table => table.id === 'scan-table')!.rows).toHaveLength(18)
    expect(tables.find(table => table.id === 'version-table')!.rows).toHaveLength(14)
    const buildValues = tables.find(table => table.id === 'build-table')!.values.map(Number)
    for (const measurement of builder.results) {
      expect(buildValues).toContain(measurement.buildMs)
    }
    snapshots.push(tables)
  }
  expect(snapshots[1]).toEqual(snapshots[0])
})

for (const prefix of ['', '/zh']) {
  test(`${prefix || 'en'} performance charts render, switch metrics and expose keyboard-readable values`, async ({ page }) => {
    test.setTimeout(60_000)
    const errors = collectErrors(page)
    await page.goto(`${prefix}/extensions/performance`)
    const root = page.getByTestId('performance-charts')
    const charts = root.getByTestId('benchmark-chart')
    await expect(charts).toHaveCount(8)
    for (const chart of await charts.all()) {
      await chart.scrollIntoViewIfNeeded()
      await expect(chart.locator('svg')).toHaveCount(1)
      await expect(chart.locator('svg path').first()).toBeAttached()
      await expect(chart).toHaveAttribute('role', 'img')
      await expect(chart).toHaveAttribute('aria-label', /\S/)
      await expectNoPageOverflow(page)
    }

    const table = root.getByTestId('scan-table')
    const summary = table.locator('summary')
    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(table).toHaveAttribute('open', '')
    await expect(table.locator('table')).toBeVisible()
    const select = root.getByTestId('scan-operation')
    const initialNumbers = await table.locator('[data-value]').evaluateAll(cells => cells.map(cell => cell.getAttribute('data-value')))
    const scanChart = root.getByTestId('scan-performance').getByTestId('benchmark-chart')
    await scanChart.scrollIntoViewIfNeeded()
    for (const operation of ['search:leftmost-first', 'search:leftmost-longest', 'count']) {
      const previousSVG = await scanChart.locator('svg').innerHTML()
      await select.selectOption(operation)
      await expect(select).toHaveValue(operation)
      await expect(table.locator('tbody tr')).toHaveCount(18)
      await expect.poll(() => scanChart.locator('svg').innerHTML()).not.toBe(previousSVG)
      expect(await table.locator('[data-value]').evaluateAll(cells => cells.map(cell => cell.getAttribute('data-value')))).not.toEqual(initialNumbers)
    }
    await select.selectOption('search')
    await expect.poll(() => table.locator('[data-value]').evaluateAll(cells => cells.map(cell => cell.getAttribute('data-value')))).toEqual(initialNumbers)
    await summary.focus()
    await page.keyboard.press('Space')
    await expect(table).not.toHaveAttribute('open')
    await expectNoPageOverflow(page)
    expect(errors).toEqual([])
  })
}

test('performance charts follow theme, resize and dispose across client navigation', async ({ page, isMobile }) => {
  const errors = collectErrors(page)
  await page.goto('/extensions/performance')
  const chart = page.getByTestId('scan-performance').getByTestId('benchmark-chart')
  await chart.scrollIntoViewIfNeeded()
  await expect(chart.locator('svg')).toHaveCount(1)
  const originalFill = await chart.locator('svg text').first().getAttribute('fill')
  const toggle = page.locator(isMobile ? '.VPNavScreenAppearance .VPSwitchAppearance' : '.VPNavBarAppearance .VPSwitchAppearance')
  if (isMobile) {
    await page.locator('.VPNavBarHamburger').click()
  }
  await toggle.click()
  if (isMobile) {
    await page.locator('.VPNavBarHamburger').click()
  }
  await expect.poll(() => chart.locator('svg text').first().getAttribute('fill')).not.toBe(originalFill)

  const originalViewport = page.viewportSize()!
  const originalWidth = (await chart.locator('svg').boundingBox())!.width
  await page.setViewportSize({ width: isMobile ? 480 : 640, height: originalViewport.height })
  await expect.poll(async () => (await chart.locator('svg').boundingBox())!.width).not.toBe(originalWidth)
  await expectNoPageOverflow(page)
  await page.setViewportSize(originalViewport)

  // These are VitePress links, so instances must be released without a full
  // document reload before mounting the performance page again.
  await page.locator('.VPDocFooter a.next').click()
  await expect(page).toHaveURL(/\/stream\/core$/)
  await expect(page.getByTestId('performance-charts')).toHaveCount(0)
  await page.locator('.VPDocFooter a.prev').click()
  await expect(page).toHaveURL(/\/extensions\/performance$/)
  await chart.scrollIntoViewIfNeeded()
  await expect(chart.locator('svg')).toHaveCount(1)
  await expect(page.getByTestId('benchmark-chart')).toHaveCount(8)
  expect(errors).toEqual([])
})

test('ordinary documentation does not load ECharts', async ({ page }) => {
  const runtimeRequests: string[] = []
  page.on('request', (request) => {
    if (runtimeURL.test(request.url())) {
      runtimeRequests.push(request.url())
    }
  })
  await page.goto('/api', { waitUntil: 'networkidle' })
  await expect(page.locator('h1')).toBeVisible()
  await expect(page.getByTestId('benchmark-chart')).toHaveCount(0)
  expect(runtimeRequests).toEqual([])
})

test('an unavailable chart runtime leaves the measurements readable', async ({ page }) => {
  let blocked = 0
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route(runtimeURL, async (route) => {
    blocked++
    await route.abort('failed')
  })
  await page.goto('/extensions/performance')
  const chart = page.getByTestId('scan-performance').getByTestId('benchmark-chart')
  await chart.scrollIntoViewIfNeeded()
  await expect(page.getByTestId('scan-performance').getByTestId('benchmark-chart-fallback')).toBeVisible()
  expect(blocked).toBeGreaterThan(0)
  await expect(chart.locator('svg')).toHaveCount(0)
  const table = page.getByTestId('scan-table')
  await table.locator('summary').click()
  await expect(table.locator('tbody tr')).toHaveCount(18)
  await expect(table.locator('tbody tr').first()).toBeVisible()
  await expectNoPageOverflow(page)
  expect(errors).toEqual([])
})
