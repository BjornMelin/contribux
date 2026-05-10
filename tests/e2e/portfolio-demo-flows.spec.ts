import { expect, test } from '@playwright/test'

test.describe('Portfolio demonstration flows', () => {
  test('presents the core open-source discovery experience', async ({ page }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { name: /find your perfect open source match/i }).first()
    ).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('demonstrates production OAuth provider integration', async ({ page }) => {
    let authorizationUrl = ''

    await page.route('https://github.com/login/oauth/authorize**', async route => {
      authorizationUrl = route.request().url()
      await route.abort('aborted')
    })

    await page.goto('/auth/signin')
    await page.getByRole('button', { name: /continue with github/i }).click()

    await expect.poll(() => authorizationUrl, { timeout: 5000 }).toContain('github.com')
    expect(new URL(authorizationUrl).pathname).toBe('/login/oauth/authorize')
  })

  test('shows hardened security behavior on protected product areas', async ({ page }) => {
    const response = await page.goto('/dashboard')
    const headers = response?.headers() ?? {}

    expect(response?.status()).toBe(401)
    await expect(page.getByText(/authentication required/i)).toBeVisible()
    expect(headers['x-frame-options']).toBe('DENY')
  })

  test('keeps mobile first-screen layout readable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    const heading = page
      .getByRole('heading', { name: /find your perfect open source match/i })
      .first()

    await expect(heading).toBeVisible()
    const box = await heading.boundingBox()
    expect(box?.width ?? 0).toBeLessThanOrEqual(375)
  })
})
