import type { Page } from '@playwright/test'

export async function clearBrowserState(page: Page): Promise<void> {
  await page.context().clearCookies()
  await page
    .context()
    .setOffline(false)
    .catch(() => undefined)

  await page.goto('/')
  await page
    .evaluate(() => {
      try {
        localStorage.clear()
      } catch {
        // Storage is unavailable on opaque origins and failed navigations.
      }

      try {
        sessionStorage.clear()
      } catch {
        // Storage is unavailable on opaque origins and failed navigations.
      }
    })
    .catch(() => undefined)
}
