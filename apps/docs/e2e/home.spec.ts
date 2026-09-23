import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

async function expectLogoTheme(page: Page, dark: boolean) {
  const visibleVariant = dark ? 'dark' : 'light'
  const hiddenVariant = dark ? 'light' : 'dark'
  const hero = page.getByTestId('hero-logo')
  const navigation = page.locator('.VPNavBarTitle')
  await expect(hero.locator(`.hero-logo-${visibleVariant}`)).toBeVisible()
  await expect(hero.locator(`.hero-logo-${hiddenVariant}`)).toBeHidden()
  await expect(navigation.locator(`img.${visibleVariant}`)).toBeVisible()
  await expect(navigation.locator(`img.${hiddenVariant}`)).toBeHidden()
  for (const image of [hero.locator(`.hero-logo-${visibleVariant}`), navigation.locator(`img.${visibleVariant}`)]) {
    await expect(image).toHaveAttribute('src', `/brand/logo-${visibleVariant}.svg`)
    await expect.poll(() => image.evaluate(image => (image as HTMLImageElement).complete
      && (image as HTMLImageElement).naturalWidth > 0)).toBe(true)
  }
}

test('bilingual home logos are server rendered with reusable SVG assets', async ({ page }) => {
  await page.goto('/api')
  for (const prefix of ['', '/zh']) {
    const response = await page.request.get(`${prefix}/`)
    expect(response.status()).toBe(200)
    const content = await page.evaluate((html) => {
      const document = new DOMParser().parseFromString(html, 'text/html')
      const logo = document.querySelector('[data-testid="hero-logo"]')
      return {
        role: logo?.getAttribute('role'),
        label: logo?.getAttribute('aria-label'),
        images: [...(logo?.querySelectorAll('img') ?? [])].map(image => ({
          src: image.getAttribute('src'),
          alt: image.getAttribute('alt'),
          width: image.getAttribute('width'),
          height: image.getAttribute('height'),
        })),
        demoOutsideIntro: !!document.querySelector('.hero-demo') && !document.querySelector('.hero-intro .hero-demo'),
        favicon: document.querySelector('link[rel="icon"]')?.getAttribute('href'),
      }
    }, await response.text())
    expect(content.role).toBe('img')
    expect(content.label).toBe(prefix ? 'modern-ahocorasick 标志' : 'modern-ahocorasick logo')
    expect(content.images).toEqual([
      { src: '/brand/logo-light.svg', alt: '', width: '400', height: '400' },
      { src: '/brand/logo-dark.svg', alt: '', width: '400', height: '400' },
    ])
    expect(content.demoOutsideIntro).toBe(true)
    expect(content.favicon?.split('?')[0]).toBe('/favicon.svg')
  }
  for (const path of ['/brand/logo-light.svg', '/brand/logo-dark.svg', '/favicon.svg']) {
    const response = await page.request.get(path)
    expect(response.status(), path).toBe(200)
    expect(response.headers()['content-type'], path).toContain('image/svg+xml')
    expect(await response.text(), path).toContain('<svg')
  }
})

for (const prefix of ['', '/zh']) {
  test(`${prefix || 'en'} home keeps calls to action before the responsive logo`, async ({ page }) => {
    await page.goto(`${prefix}/`)
    const hero = page.getByTestId('hero-logo')
    await expect(hero).toHaveAccessibleName(prefix ? 'modern-ahocorasick 标志' : 'modern-ahocorasick logo')
    const links = page.locator('.hero-intro-copy .hero-links a')
    await expect(links).toHaveCount(2)
    await expect(links.nth(0)).toHaveAttribute('href', `${prefix}/visualization`)
    await expect(links.nth(1)).toHaveAttribute('href', `${prefix}/getting-started`)
    for (const width of [393, 768, 960, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      await expect.poll(() => page.evaluate(() => {
        const intro = document.querySelector('.hero-intro')!.getBoundingClientRect()
        const copy = document.querySelector('.hero-intro-copy')!.getBoundingClientRect()
        const logo = document.querySelector('[data-testid="hero-logo"]')!.getBoundingClientRect()
        const demo = document.querySelector('.hero-demo')!.getBoundingClientRect()
        const links = document.querySelector('.hero-intro-copy .hero-links')!.getBoundingClientRect()
        const stacked = window.innerWidth <= 960
        return {
          noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
          copyBeforeLogo: stacked ? copy.bottom <= logo.top + 1 : copy.right <= logo.left + 1,
          actionsBeforeLogo: stacked ? links.bottom <= logo.top + 1 : links.right <= logo.left + 1,
          centeredWhenStacked: !stacked || Math.abs(logo.left + logo.width / 2 - intro.left - intro.width / 2) < 2,
          logoSize: stacked ? logo.width >= 200 && logo.width <= 260 : logo.width >= 360 && logo.width <= 400,
          fullWidthDemo: Math.abs(demo.width - intro.width) < 2 && demo.top >= intro.bottom - 1,
        }
      })).toEqual({
        noOverflow: true,
        copyBeforeLogo: true,
        actionsBeforeLogo: true,
        centeredWhenStacked: true,
        logoSize: true,
        fullWidthDemo: true,
      })
    }
    await links.nth(1).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`${prefix}/getting-started$`))
    await page.locator('.VPNavBarTitle a').click()
    await expect(page).toHaveURL(new RegExp(`${prefix}/$`))
    await links.nth(0).click()
    await expect(page).toHaveURL(new RegExp(`${prefix}/visualization$`))
  })

  test(`${prefix || 'en'} hero and navigation logos follow manual theme overrides`, async ({ page, isMobile }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text())
      }
    })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto(`${prefix}/`)
    await expectLogoTheme(page, false)
    const toggle = page.locator(isMobile ? '.VPNavScreenAppearance .VPSwitchAppearance' : '.VPNavBarAppearance .VPSwitchAppearance')
    async function toggleTheme() {
      if (isMobile) {
        await page.locator('.VPNavBarHamburger').click()
      }
      await toggle.focus()
      await page.keyboard.press('Space')
      if (isMobile) {
        await page.locator('.VPNavBarHamburger').click()
      }
    }
    // A manual choice must win over the operating-system preference in both directions.
    await toggleTheme()
    await expectLogoTheme(page, true)
    await page.emulateMedia({ colorScheme: 'dark' })
    // Start the opposite preference from a fresh document so a pending browser
    // media-query change cannot race the next keyboard activation.
    await page.reload()
    await expectLogoTheme(page, true)
    await toggleTheme()
    await expectLogoTheme(page, false)
    await page.reload()
    await expectLogoTheme(page, false)
    expect(errors).toEqual([])
  })
}
