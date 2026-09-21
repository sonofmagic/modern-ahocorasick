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
