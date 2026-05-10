import { expect, test } from '@playwright/test'

function isolatedHeaders(label: string) {
  return { 'x-api-key': `e2e-search-${label}-${Date.now()}` }
}

test.describe('Search and repository discovery contracts', () => {
  test('renders the current public discovery landing page', async ({ page }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { name: /find your perfect open source match/i }).first()
    ).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('returns deterministic repository search results', async ({ request }) => {
    const response = await request.get('/api/search/repositories?q=react', {
      headers: isolatedHeaders('react'),
    })

    expect(response.status()).toBe(200)
    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(payload.data.repositories.length).toBeGreaterThan(0)
    expect(payload.data.repositories[0]).toMatchObject({
      fullName: 'facebook/react',
      owner: 'facebook',
      name: 'react',
    })
  })

  test('supports repository search pagination and page size parameters', async ({ request }) => {
    const response = await request.get('/api/search/repositories?q=react&per_page=1&page=1', {
      headers: isolatedHeaders('pagination'),
    })

    expect(response.status()).toBe(200)
    const payload = await response.json()
    expect(payload.data.repositories.length).toBeLessThanOrEqual(1)
    expect(payload.data).toMatchObject({
      page: 1,
      per_page: 1,
    })
  })

  test('supports language and sort filters on repository search', async ({ request }) => {
    const response = await request.get(
      '/api/search/repositories?q=typescript&language=TypeScript&sort=stars&order=desc',
      { headers: isolatedHeaders('filters') }
    )

    expect(response.status()).toBe(200)
    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(payload.metadata.filters).toMatchObject({
      language: 'TypeScript',
      sort: 'stars',
      order: 'desc',
    })
  })

  test('returns structured validation errors for invalid search input', async ({ request }) => {
    const response = await request.get('/api/search/repositories?q=', {
      headers: isolatedHeaders('invalid'),
    })

    expect([400, 422]).toContain(response.status())
    const payload = await response.json()
    expect(payload).toHaveProperty('error')
    expect(payload.error).toHaveProperty('code')
    expect(payload.error).toHaveProperty('message')
  })

  test('requires authentication before opportunity search queries execute', async ({ request }) => {
    const response = await request.get('/api/search/opportunities?q=react', {
      headers: isolatedHeaders('opportunities'),
    })

    expect(response.status()).toBe(401)
    const payload = await response.json()
    expect(payload).toMatchObject({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
      },
    })
  })

  test('keeps public discovery usable after a failed search request', async ({ page, request }) => {
    await request.get('/api/search/repositories?q=', {
      headers: isolatedHeaders('failed-first'),
    })

    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: /find your perfect open source match/i }).first()
    ).toBeVisible()
  })
})
