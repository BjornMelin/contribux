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

    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press('Tab')
      if ((await page.locator('button:focus, a:focus').count()) > 0) {
        break
      }
    }

    await expect(page.locator('button:focus, a:focus').first()).toBeVisible()
  })

  test('serves public health without requiring app authentication', async ({ request }) => {
    const response = await request.get('/api/simple-health')

    expect(response.status()).toBe(200)
    expect(await response.json()).toHaveProperty('status')
  })
})
