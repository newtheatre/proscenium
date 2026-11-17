// Live mode (UI-05): the Tonight hub's tiles, the dark default, the status strip and 48-pixel targets.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const as = (abilities: string[]) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify({ kind: 'person', accountId: 'acc_liveperson', name: 'Lee Live', grants: abilities.map(ability => ({ ability, via: 'test' })), assurance: 'strong', reassertedAt: Date.now() }) } })

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
const noViolations = async (page: Page) => expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])

test.describe('someone who can work tonight', () => {
  test.use(as(['gallery.sample.view', 'gallery.sample.manage']))

  test('opens Tonight from the account menu and sees the live tiles, in dark', async ({ page }) => {
    await visit(page, '/console')
    await page.getByRole('button', { name: /Open the menu for/ }).click()
    await page.getByRole('menuitem', { name: 'Tonight' }).click()
    await expect(page).toHaveURL(/\/live$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('link', { name: 'Leave live mode' })).toBeVisible()
    await noViolations(page)
  })

  test('a live screen has the strip, the way back and large targets', async ({ page }) => {
    await visit(page, '/live')
    await page.getByRole('link', { name: 'Sample door' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Sample door' })).toBeVisible()
    await expect(page.getByText('Sample show, 7.30pm', { exact: true })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Online' })).toBeVisible()
    const box = await page.getByRole('button', { name: 'Admit' }).boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(48)
    await page.getByRole('link', { name: 'Back to Tonight' }).click()
    await expect(page).toHaveURL(/\/live$/)
    await noViolations(page)
  })
})

test.describe('someone with nothing to do tonight', () => {
  test.use(as(['gallery.sample.view']))

  test('finds no Tonight entry and no live mode', async ({ page }) => {
    await visit(page, '/console')
    await page.getByRole('button', { name: /Open the menu for/ }).click()
    await expect(page.getByRole('menuitem', { name: 'Tonight' })).toHaveCount(0)
    const response = await page.goto('/live')
    expect(response?.status()).toBe(404)
  })
})
