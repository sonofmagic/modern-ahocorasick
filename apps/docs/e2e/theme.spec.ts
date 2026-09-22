import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

async function expectAppearance(page: Page, toggle: Locator, dark: boolean, chinese: boolean) {
  await expect(toggle).toHaveAttribute('aria-checked', String(dark))
  await expect(page.locator('html')).toHaveClass(dark ? /\bdark\b/ : /^(?!.*\bdark\b)/)
  await expect(toggle).toHaveAttribute('title', chinese
    ? (dark ? '切换到亮色主题' : '切换到暗色主题')
    : (dark ? 'Switch to light theme' : 'Switch to dark theme'))
  await expect(toggle.locator(dark ? '.moon' : '.sun')).toHaveCSS('opacity', '1')
  await expect(toggle.locator(dark ? '.sun' : '.moon')).toHaveCSS('opacity', '0')
  // Catch global CSS leaking into the default theme, including a displaced thumb.
  await expect.poll(async () => toggle.evaluate((button, dark) => {
    const track = button.getBoundingClientRect()
    const thumb = button.querySelector('.check')!.getBoundingClientRect()
    const icon = button.querySelector(dark ? '.moon' : '.sun')!.getBoundingClientRect()
    const inside = (inner: DOMRect, outer: DOMRect) => inner.width > 0 && inner.height > 0
      && inner.left >= outer.left && inner.right <= outer.right
      && inner.top >= outer.top && inner.bottom <= outer.bottom
    const center = (rect: DOMRect) => rect.left + rect.width / 2
    return {
      thumbInside: inside(thumb, track),
      iconInside: inside(icon, thumb),
      centeredVertically: Math.abs(thumb.top + thumb.height / 2 - track.top - track.height / 2) < 1,
      correctSide: dark ? center(thumb) > center(track) : center(thumb) < center(track),
    }
  }, dark)).toEqual({ thumbInside: true, iconInside: true, centeredVertically: true, correctSide: true })
}

for (const prefix of ['', '/zh']) {
  test(`${prefix || 'en'} theme switch stays aligned and toggles on docs and workbench`, async ({ page, isMobile }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    const chinese = prefix === '/zh'
    const toggle = page.locator(isMobile ? '.VPNavScreenAppearance .VPSwitchAppearance' : '.VPNavBarAppearance .VPSwitchAppearance')
    async function openMenu() {
      if (isMobile) {
        await page.locator('.VPNavBarHamburger').click()
      }
      await expect(toggle).toBeVisible()
    }
    for (const path of ['/getting-started', '/visualization']) {
      await page.goto(`${prefix}${path}`)
      await openMenu()
      await expectAppearance(page, toggle, false, chinese)
      await toggle.click()
      await expectAppearance(page, toggle, true, chinese)
      await toggle.focus()
      await page.keyboard.press('Space')
      await expectAppearance(page, toggle, false, chinese)
      await page.keyboard.press('Enter')
      await expectAppearance(page, toggle, true, chinese)
      await toggle.click()
      await expectAppearance(page, toggle, false, chinese)
    }
  })
}
