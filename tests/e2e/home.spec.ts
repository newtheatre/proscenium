import { expect, test } from '@playwright/test'
test('the built Worker serves a page and reads D1', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toContainText('HOME')
  const health = await (await request.get('/api/core/health')).json()
  expect(health.d1.ok).toBe(1)
  expect(health.runtime).toBe('Cloudflare-Workers')
})
