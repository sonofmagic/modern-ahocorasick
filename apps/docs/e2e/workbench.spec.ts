import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'

for (const locale of ['', '/zh']) {
  test(`${locale || 'en'} playback, graph and result synchronization`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text())
      }
    })
    await page.goto(`${locale}/visualization`)
    const button = (en: string, zh: string) =>
      page.getByRole('button', { name: locale ? zh : en, exact: true })
    await expect(page.locator('.graph-node')).toHaveCount(10)
    await expect(page.getByTestId('progress')).toHaveText('0 / 10')
    await button('Next step', '单步前进').click()
    await expect(page.getByTestId('progress')).toHaveText('1 / 10')
    await expect(page.getByTestId('current-state')).toHaveText('0')
    await expect(page.locator('.root-loop')).toHaveClass(/active/)
    await button('Continue', '继续').click()
    await page.locator('#speed').fill('0.5')
    await expect(page.getByTestId('progress')).toHaveText('1 / 10')
    await button('Pause', '暂停').click()
    const progress = await page.getByTestId('progress').textContent()
    await page.waitForTimeout(650)
    await expect(page.getByTestId('progress')).toHaveText(progress!)
    await page.locator('#speed').fill('10')
    await expect(page.getByTestId('progress')).toHaveText(progress!)
    await button('Continue', '继续').click()
    await expect(button('Replay', '重新播放')).toBeVisible()
    await expect(page.getByTestId('grouped-results')).toHaveText(
      '[[3,["she","he"]],[5,["hers"]]]',
    )
    const hits = JSON.parse(
      (await page.getByTestId('structured-results').textContent())!,
    )
    expect(hits.map((hit: { pattern: string }) => hit.pattern)).toEqual([
      'she',
      'he',
      'hers',
    ])
    await expect(page.getByTestId('current-state')).toHaveText('9')
    await expect(page.locator('tr[aria-current=step] td').first()).toHaveText(
      '9',
    )
    const transform = page.getByTestId('graph-transform')
    const initial = await transform.getAttribute('transform')
    await button('Zoom in', '放大').click()
    await expect(transform).not.toHaveAttribute('transform', initial!)
    await button('Fit graph', '适应画布').click()
    await expect(transform).toHaveAttribute('transform', initial!)
    await page.locator('svg.state-graph').focus()
    await page.keyboard.press('+')
    await expect(transform).not.toHaveAttribute('transform', initial!)
    await page.keyboard.press('0')
    await expect(transform).toHaveAttribute('transform', initial!)
    const box = await page.locator('svg.state-graph').boundingBox()
    await page.mouse.move(box!.x + 80, box!.y + 80)
    await page.mouse.down()
    await page.mouse.move(box!.x + 140, box!.y + 110, { steps: 4 })
    await page.mouse.up()
    await expect(transform).not.toHaveAttribute('transform', initial!)
    await button('Fit graph', '适应画布').click()
    await page.locator('svg.state-graph').hover()
    await page.mouse.wheel(0, -150)
    await expect(transform).not.toHaveAttribute('transform', initial!)
    await button('Fit graph', '适应画布').click()
    await page.getByRole('checkbox').check()
    await expect(page.locator('.failure-edge:visible')).toHaveCount(9)
    await page.getByRole('checkbox').uncheck()
    await expect(page.locator('.failure-edge:visible')).toHaveCount(0)
    await button('Replay', '重新播放').click()
    await button('Reset', '重置').click()
    await page.waitForTimeout(200)
    await expect(page.getByTestId('progress')).toHaveText('0 / 10')
    for (let i = 0; i < 7; i++) {
      await button('Next step', '单步前进').click()
    }
    await expect(page.locator('.failure-edge.active:visible')).toHaveCount(1)
    await expect(page.locator('tr.fallback')).toHaveCount(1)
    expect(errors).toEqual([])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  })
}

test('input changes cancel playback; session restores; text is never HTML', async ({
  page,
}) => {
  await page.goto('/visualization')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await page.locator('#keywords').fill('<img>,a,a')
  await page.locator('#search-text').fill(' <img> a\n ')
  await page.locator('#speed').fill('10')
  await page.waitForTimeout(650)
  await expect(page.getByTestId('progress')).toHaveText(/^0 \/ /)
  await page.reload()
  await expect(page.locator('#search-text')).toHaveValue(' <img> a\n ')
  await expect(page.locator('#keywords')).toHaveValue('<img>,a,a')
  await expect(page.locator('#speed')).toHaveValue('10')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible()
  await expect(page.locator('.workbench img')).toHaveCount(0)
  const hits = JSON.parse(
    (await page.getByTestId('structured-results').textContent())!,
  )
  expect(hits.map((hit: { patternIndex: number }) => hit.patternIndex)).toEqual(
    [0, 1, 2],
  )
  await page.locator('#example').selectOption('emoji')
  await expect(page.getByTestId('progress')).toHaveText(/^0 \/ /)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible()
  await expect(page.getByTestId('grouped-results')).toContainText('👨‍👩‍👧‍👦')
  await page.locator('#keywords').fill(' , ')
  await expect(page.getByRole('status')).toContainText('at least one')
  await expect(
    page.getByRole('button', { name: 'Run', exact: true }),
  ).toBeDisabled()
  await page.locator('#keywords').fill('a')
  await page.locator('#search-text').fill('')
  await expect(page.getByTestId('structured-results')).toHaveText('[]')
})

test('storage can be unavailable and navigation cancels playback', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new Error('blocked')
      },
    })
  })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  await page.goto('/visualization')
  await expect(page.locator('#keywords')).toHaveValue('he,she,his,hers')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await page.locator('.VPNavBarTitle a, a.VPNavBarTitle').first().click()
  await expect(page.locator('.hero-title')).toBeVisible()
  await page.getByRole('link', { name: 'Open the workbench →' }).click()
  await expect(page.getByTestId('progress')).toHaveText('0 / 10')
  expect(errors).toEqual([])
})

test('bilingual static pages, links, search, theme and code copy', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  for (const prefix of ['', '/zh']) {
    for (const path of [
      '',
      '/getting-started',
      '/api',
      '/algorithm',
      '/unicode',
      '/examples',
      '/visualization',
    ]) {
      const response = await page.goto(`${prefix}${path || '/'}`)
      expect(response?.status()).toBe(200)
      await expect(page.locator('h1')).toBeVisible()
      const links = await page
        .locator('main a[href]')
        .evaluateAll(anchors =>
          anchors
            .map(anchor => anchor.getAttribute('href'))
            .filter(
              (href): href is string =>
                !!href && !href.startsWith('http') && !href.startsWith('#'),
            ),
        )
      for (const link of new Set(links)) {
        const url = new URL(link, page.url())
        const res = await page.request.get(url.href)
        expect(res.status(), url.href).toBe(200)
      }
    }
  }
  await page.goto('/getting-started')
  await expect(page.locator('button.copy').first()).toBeAttached()
  await page.locator('.VPNavBarSearch button').click()
  await page.locator('#localsearch-input').fill('grapheme')
  await expect(page.locator('.VPLocalSearchBox .result').first()).toBeVisible()
  await page.keyboard.press('Escape')
  const theme = page.locator('.VPNavBarAppearance button')
  if (await theme.isVisible()) {
    const before = await page.locator('html').getAttribute('class')
    await theme.click()
    expect(await page.locator('html').getAttribute('class')).not.toBe(before)
  }
  expect(errors).toEqual([])
})

for (const locale of ['', '/zh']) {
  test(`${locale || 'en'} strategies, replacement, seek and state inspector`, async ({
    page,
  }) => {
    await page.goto(`${locale}/visualization`)
    const button = (en: string, zh: string) =>
      page.getByRole('button', { name: locale ? zh : en, exact: true })
    await expect(page.getByTestId('lab-count')).toHaveText('3')
    await button('Next match', '下一个命中').click()
    await expect(page.getByTestId('progress')).toHaveText('5 / 10')
    await expect(page.getByTestId('selected-slice')).toHaveText('"she"')
    await button('Next match', '下一个命中').click()
    await expect(page.getByTestId('progress')).toHaveText('6 / 10')
    await button('Previous match', '上一个命中').click()
    await expect(page.getByTestId('progress')).toHaveText('5 / 10')
    await button('Previous step', '上一步').click()
    await expect(page.getByTestId('structured-results')).toHaveText('[]')
    await page.locator('#timeline').fill('10')
    await expect(page.getByTestId('grouped-results')).toHaveText(
      '[[3,["she","he"]],[5,["hers"]]]',
    )
    await page.locator('#timeline').fill('0')
    await page.locator('.match-result').filter({ hasText: '#0 "he"' }).click()
    await expect(page.getByTestId('progress')).toHaveText('6 / 10')
    await expect(page.getByTestId('selected-slice')).toHaveText('"he"')
    await expect(page.locator('.tape-cell.matched')).toHaveCount(2)
    await page.locator('.graph-node').filter({ hasText: /^5$/ }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('inspector')).toContainText('"she"')
    await expect(page.getByTestId('inspector')).toContainText('"he"')
    await page.locator('#example').selectOption('overlap')
    await expect(page.getByTestId('lab-count')).toHaveText('13')
    await page.locator('#replacement').fill('$&')
    await expect(page.getByTestId('replacement-preview')).toHaveText('$&$&')
    await page.locator('#strategy').selectOption('leftmost-first')
    await expect(page.getByTestId('lab-count')).toHaveText('4')
    await expect(page.getByTestId('replacement-preview')).toHaveText(
      '$&$&$&$&',
    )
    await page.locator('#strategy').selectOption('leftmost-longest')
    await expect(page.getByTestId('lab-count')).toHaveText('2')
    await expect(page.getByTestId('replacement-preview')).toHaveText('$&$&')
    await page.locator('#example').selectOption('emoji')
    await expect(page.getByTestId('lab-count')).toHaveText('2')
    await page.locator('.match-result').first().click()
    await expect(page.getByTestId('selected-slice')).toHaveText('"👨‍👩‍👧‍👦"')
    await expect(page.locator('.tape-cell.matched')).toHaveCount(1)
    await expect(page.locator('.tape-cell.matched')).toContainText('[3, 14)')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}

test('share links, export/import, code copy fallback and extended session restore', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('blocked')
        },
      },
    })
  })
  await page.goto('/visualization')
  await page.locator('#example').selectOption('combining')
  await page.locator('#strategy').selectOption('leftmost-first')
  await page.locator('#replacement').fill('<tag>$&')
  await page.getByRole('checkbox').check()
  await expect(page.getByTestId('lab-count')).toHaveText('3')
  await page.reload()
  await expect(page.locator('#strategy')).toHaveValue('leftmost-first')
  await expect(page.locator('#replacement')).toHaveValue('<tag>$&')
  await expect(page.getByRole('checkbox')).toBeChecked()
  await page.getByRole('button', { name: 'Copy TypeScript' }).click()
  await expect(page.locator('.sharing textarea')).toHaveValue(
    /import AhoCorasick/,
  )
  const originalUrl = page.url()
  await page.getByRole('button', { name: 'Copy share link' }).click()
  const link = await page.locator('.sharing textarea').inputValue()
  expect(page.url()).toBe(originalUrl)
  expect(link).toContain('#workbench=')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) {
    // Read the actual download, including complete results beyond the UI page.
    chunks.push(chunk)
  }
  const exported = JSON.parse(Buffer.concat(chunks).toString())
  expect(exported.version).toBe(1)
  expect(exported.results).toHaveLength(3)
  expect(exported.replaced).toBe('<tag>$& <tag>$&t <tag>$&')
  await page.locator('#keywords').fill('x')
  await page.goto(link)
  await expect(page.locator('#keywords')).toHaveValue('é,é,e')
  await expect(page.getByTestId('lab-count')).toHaveText('3')
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'example.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          ...exported,
          input: { ...exported.input, text: 'éé' },
        }),
      ),
    })
  await expect(page.locator('#search-text')).toHaveValue('éé')
  await expect(page.getByTestId('lab-count')).toHaveText('2')
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{'),
    })
  await expect(page.getByTestId('share-notice')).toContainText(
    'Invalid configuration',
  )
  await expect(page.locator('#search-text')).toHaveValue('éé')
  await page.locator('#search-text').fill('<img>é')
  await expect(page.getByTestId('highlighted-text')).toHaveText('<img>é')
  await expect(page.locator('.workbench img')).toHaveCount(0)
})

test('large inputs stay bounded, recover from limits and cancel stale computations', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/visualization')
  await page.locator('#keywords').fill('a')
  await page.locator('#search-text').fill('ab'.repeat(10000))
  await expect(page.getByTestId('lab-count')).toHaveText('10000')
  await expect(page.locator('.tape-cell')).toHaveCount(100)
  await expect(page.locator('.match-result')).toHaveCount(100)
  await page.locator('#timeline').fill('40000')
  await expect(page.getByTestId('progress')).toHaveText('40000 / 40000')
  await expect(page.locator('.tape-cell.selected')).toContainText('G19999')
  await page.locator('#keywords').fill('a,a,a,a')
  await expect(page.getByRole('alert')).toContainText('limit exceeded')
  await page.locator('#keywords').fill('a'.repeat(180))
  await page.locator('#search-text').fill('a'.repeat(180))
  await expect(page.getByTestId('lab-count')).toHaveText('1')
  await expect(page.locator('.graph-limit')).toBeVisible()
  await expect(page.locator('.graph-node')).toHaveCount(0)
  await page.locator('.match-result').click()
  await expect(page.getByTestId('current-state')).toHaveText('180')
  await expect(page.locator('tr[aria-current=step]')).toContainText('180')
  await page.locator('#search-text').fill('x'.repeat(20001))
  await expect(page.getByRole('alert')).toContainText('limit exceeded')
  await page.locator('#example').selectOption('emoji')
  await page.locator('#example').selectOption('classic')
  await expect(page.getByTestId('lab-count')).toHaveText('3')
  await expect(page.getByTestId('progress')).toHaveText('0 / 10')
  expect(errors).toEqual([])
})

test('copies runnable code and explicit share links to an available clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/visualization')
  await expect(page.getByTestId('lab-count')).toHaveText('3')
  await page.getByRole('button', { name: 'Copy TypeScript' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('import AhoCorasick from \'modern-ahocorasick\'')
  await page.getByRole('button', { name: 'Copy share link' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('#workbench=')
  await expect(page.getByTestId('share-notice')).toHaveText('Copied.')
  expect(new URL(page.url()).hash).toBe('')
})
