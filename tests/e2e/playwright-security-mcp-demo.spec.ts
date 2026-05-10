import { expect, test } from '@playwright/test'

test.describe('Browser security smoke tests', () => {
  test('renders the authentication flow with accessible provider controls', async ({ page }) => {
    await page.goto('/auth/signin')

    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with github/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
  })

  test('keeps expected auth controls keyboard reachable within main', async ({ page }) => {
    await page.goto('/auth/signin')

    const focusTargets = [
      page.getByRole('button', { name: /continue with github/i }),
      page.getByRole('button', { name: /continue with google/i }),
      page.getByRole('link', { name: /terms of service/i }),
      page.getByRole('link', { name: /privacy policy/i }),
    ]

    for (const target of focusTargets) {
      await expect(target).toBeVisible()
    }

    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    })

    const expectedFocusTargets = [/github/i, /google/i, /terms of service/i, /privacy policy/i]
    const foundTargetIndexes = new Set<number>()

    for (let index = 0; index < 12 && foundTargetIndexes.size < focusTargets.length; index++) {
      await page.keyboard.press('Tab')
      const activeFocus = await page.evaluate(() => {
        const main = document.querySelector('main')
        const active = document.activeElement
        return {
          label:
            active instanceof HTMLElement
              ? active.innerText || active.textContent || active.getAttribute('aria-label') || ''
              : '',
          withinMain: active instanceof HTMLElement && Boolean(main?.contains(active)),
        }
      })

      const targetIndex = expectedFocusTargets.findIndex(
        (pattern, expectedIndex) =>
          pattern.test(activeFocus.label) && !foundTargetIndexes.has(expectedIndex)
      )

      if (targetIndex >= 0) {
        expect(activeFocus.withinMain).toBe(true)
        foundTargetIndexes.add(targetIndex)
      }
    }

    expect([...foundTargetIndexes].sort()).toEqual([0, 1, 2, 3])
  })

  test('serves public health without requiring app authentication', async ({ request }) => {
    const response = await request.get('/api/simple-health')

    expect(response.status()).toBe(200)
    expect(await response.json()).toHaveProperty('status')
  })
})
