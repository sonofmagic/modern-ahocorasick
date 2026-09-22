import { expect, test } from '@playwright/test'
import { docsGroups } from '../.vitepress/navigation.js'
import legacyAnchors from './legacy-anchors.json' with { type: 'json' }

for (const prefix of ['', '/zh']) {
  test(`${prefix || 'en'} documentation routes, local links and legacy anchors`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`${prefix}/api`)
    const origin = new URL(page.url()).origin
    const documents = new Map<string, { ids: string[], links: string[], heading: string, description: string }>()
    async function readDocument(path: string) {
      if (!documents.has(path)) {
        const response = await page.request.get(path)
        expect(response.status(), path).toBe(200)
        const html = await response.text()
        const data = await page.evaluate((html) => {
          const doc = new DOMParser().parseFromString(html, 'text/html')
          return {
            ids: [...doc.querySelectorAll('[id]')].map(el => el.id),
            links: [...doc.querySelectorAll('main a[href]')].map(el => el.getAttribute('href')!),
            heading: doc.querySelector('h1')?.textContent ?? '',
            description: doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
          }
        }, html)
        expect(data.heading, path).not.toBe('')
        expect(data.description, path).not.toBe('')
        documents.set(path, data)
      }
      return documents.get(path)!
    }
    for (const route of ['', ...docsGroups.flatMap(group => group.items.map(item => item.path))]) {
      const path = `${prefix}/${route}`
      const doc = await readDocument(path)
      const oldAnchors = (legacyAnchors as Record<string, string[]>)[path] ?? []
      for (const anchor of oldAnchors) {
        expect(doc.ids, `${path}#${anchor}`).toContain(anchor)
      }
      for (const href of new Set(doc.links)) {
        const target = new URL(href, `${origin}${path}`)
        if (target.origin !== origin) {
          continue
        }
        const linked = await readDocument(target.pathname)
        if (target.hash) {
          expect(linked.ids, `${path} → ${href}`).toContain(decodeURIComponent(target.hash.slice(1)))
        }
      }
    }
  })

  test(`${prefix || 'en'} nested navigation, page sequence, locale and search`, async ({ page, isMobile }) => {
    await page.goto(`${prefix}/getting-started`)
    if (isMobile) {
      await page.locator('.VPLocalNav .menu').click()
    }
    const sidebar = page.locator('.VPSidebar')
    const streams = sidebar.locator('.VPSidebarItem.level-0').filter({ has: page.getByRole('heading', { name: prefix ? '流式处理' : 'Streams', exact: true }) })
    const toggle = streams.getByRole('button', { name: 'toggle section' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await streams.locator(`a[href="${prefix}/stream/sessions"]`).click()
    await expect(page).toHaveURL(new RegExp(`${prefix}/stream/sessions$`))
    await expect(page.locator('h1')).toHaveText(prefix ? '增量会话、迭代与预览' : 'Sessions, iterables and previews')
    await expect(page.locator('.VPDocFooter a.prev')).toHaveAttribute('href', `${prefix}/stream/core`)
    await page.locator('.VPDocFooter a.next').click()
    await expect(page).toHaveURL(new RegExp(`${prefix}/stream/async$`))
    await page.locator('.VPDocFooter a.prev').click()
    await expect(page).toHaveURL(new RegExp(`${prefix}/stream/sessions$`))

    if (isMobile) {
      await page.locator('.VPNavBarHamburger').click()
      await page.locator('.VPNavScreenTranslations button').click()
      await page.locator('.VPNavScreenTranslations').getByRole('link', { name: prefix ? 'English' : '简体中文', exact: true }).click()
    }
    else {
      await page.locator('.VPNavBar .VPNavBarTranslations button').click()
      await page.locator('.VPNavBar .VPNavBarTranslations').getByRole('link', { name: prefix ? 'English' : '简体中文', exact: true }).click()
    }
    await expect(page).toHaveURL(new RegExp(`${prefix ? '' : '/zh'}/stream/sessions$`))
    await expect(page.locator('h1')).toHaveText(prefix ? 'Sessions, iterables and previews' : '增量会话、迭代与预览')

    await page.goto(`${prefix}/api/stats`)
    await page.locator('.VPNavBarSearch button').click()
    await page.locator('#localsearch-input').fill(prefix ? '编译统计' : 'Compilation statistics')
    await expect(page.locator(`.VPLocalSearchBox a[href*="${prefix}/api/stats"]`).first()).toBeVisible()
    await page.keyboard.press('Escape')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}
