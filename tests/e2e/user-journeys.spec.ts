import { expect, test } from '@playwright/test'

function isolatedHeaders(label: string) {
  return { 'x-api-key': `e2e-journey-${label}-${Date.now()}` }
}

test.describe('Current user journeys', () => {
  test('supports unauthenticated discovery from the public landing page', async ({ page }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { name: /find your perfect open source match/i }).first()
    ).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('supports the OAuth sign-in journey until external provider handoff', async ({ page }) => {
    let authorizationUrl = ''

    await page.route('https://github.com/login/oauth/authorize**', async route => {
      authorizationUrl = route.request().url()
      await route.abort('aborted')
    })

    await page.goto('/auth/signin')
    await expect(page.getByRole('button', { name: /continue with github/i })).toBeVisible()
    await page.getByRole('button', { name: /continue with github/i }).click()

    await expect.poll(() => authorizationUrl, { timeout: 5000 }).toContain('github.com')
  })

  test('keeps session state consistent across tabs before sign-in', async ({ browser }) => {
    const context = await browser.newContext()
    const page1 = await context.newPage()
    const page2 = await context.newPage()

    const [response1, response2] = await Promise.all([
      page1.request.get('/api/auth/session', { headers: isolatedHeaders('tab-1') }),
      page2.request.get('/api/auth/session', { headers: isolatedHeaders('tab-2') }),
    ])

    expect(response1.status()).toBe(200)
    expect(response2.status()).toBe(200)
    expect(await response1.json()).toEqual(await response2.json())

    await context.close()
  })

  test('supports public repository discovery through the current API', async ({ request }) => {
    const response = await request.get('/api/search/repositories?q=react', {
      headers: isolatedHeaders('repo-discovery'),
    })

    expect(response.status()).toBe(200)
    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(payload.data.repositories[0]).toHaveProperty('fullName', 'facebook/react')
  })

  test('recovers public discovery after validation errors', async ({ page, request }) => {
    await request.get('/api/search/repositories?q=', {
      headers: isolatedHeaders('invalid-search'),
    })

    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: /find your perfect open source match/i }).first()
    ).toBeVisible()
  })

  test('keeps protected areas unavailable to anonymous users', async ({ request }) => {
    for (const endpoint of ['/dashboard', '/settings/accounts', '/api/monitoring/dashboard']) {
      const response = await request.get(endpoint, { headers: isolatedHeaders(endpoint) })
      expect(response.status(), endpoint).toBe(401)
    }
  })
})
