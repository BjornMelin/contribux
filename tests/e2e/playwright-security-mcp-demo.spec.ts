import { expect, test } from '@playwright/test'

test.describe('Browser security smoke tests', () => {
  test('renders the authentication flow with accessible provider controls', async ({ page }) => {
    await page.goto('/auth/signin')

    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with github/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
  })

  test('keeps keyboard focus within visible auth controls and links', async ({ page }) => {
    await page.goto('/auth/signin')

    const focusTargets = [
      page.getByRole('button', { name: /continue with github/i }),
      page.getByRole('button', { name: /continue with google/i }),
      page.getByRole('link', { name: /terms of service/i }),
      page.getByRole('link', { name: /privacy policy/i }),
    ]

    await focusTargets[0].focus()

    for (const [index, target] of focusTargets.entries()) {
      await expect(target).toBeFocused()

      const focusedWithinAuth = await page.evaluate(() => {
        const main = document.querySelector('main')
        const active = document.activeElement
        return active instanceof HTMLElement && Boolean(main?.contains(active))
      })
      expect(focusedWithinAuth).toBe(true)

      if (index < focusTargets.length - 1) {
        await page.keyboard.press('Tab')
      }
    }
  })

  test('serves public health without requiring app authentication', async ({ request }) => {
    const response = await request.get('/api/simple-health')

    expect(response.status()).toBe(200)
    expect(await response.json()).toHaveProperty('status')
  })
})
