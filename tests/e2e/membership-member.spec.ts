// A member's own screens: the members' area home shows their membership card with Show card, and on
// a phone My membership keeps the scheme's name and dates readable, with End membership in the row's
// menu. A verification list's page opens with what it holds and its two windows.
import { test, expect, devices, type APIRequestContext, type Page } from '@playwright/test'

const grant = (ability: string) => ({ ability, via: 'test' })
const stamp = Date.now()
const admin = { kind: 'person', accountId: 'acc_memberscreens_admin', name: 'Ada Admin', assurance: 'strong', reassertedAt: stamp, grants: ['core.settings.manage', 'core.modules.manage', 'membership.scheme.view', 'membership.scheme.manage', 'membership.verification-list.view', 'membership.verification-list.manage'].map(grant) }
const member = { kind: 'person', accountId: `acc_memberscreens_${stamp}`, name: 'Mo Member', assurance: 'strong', reassertedAt: stamp, grants: [] }
const as = (actor: object) => ({ 'x-test-actor': JSON.stringify(actor) })
const key = () => ({ 'idempotency-key': crypto.randomUUID() })

async function ok(api: APIRequestContext, method: 'post' | 'put', url: string, data: object) {
  const response = await api[method](url, { data, headers: method === 'post' ? key() : {} })
  expect(response.ok(), `${url}: ${await response.text()}`).toBe(true)
  return await response.json()
}

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

let listId = ''
test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', extraHTTPHeaders: as(admin) })
  await ok(api, 'put', '/api/core/settings', { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }], confirm: true })
  await ok(api, 'put', '/api/core/modules/membership', { on: true })
  const { schemeId } = await ok(api, 'post', '/api/membership/schemes', { name: `Members ${stamp}`, key: `members-${stamp}`, side: 'members', lengthRule: 'rolling' })
  await ok(api, 'post', `/api/membership/schemes/${schemeId}/options`, { name: '1 year', count: 12 })
  await ok(api, 'post', `/api/membership/schemes/${schemeId}/state`, { to: 'open' })
  const list = await ok(api, 'post', '/api/membership/lists', { name: `Students ${stamp}`, keyKind: 'email' })
  listId = list.listId ?? list.id
  await api.dispose()
  const mine = await playwright.request.newContext({ baseURL: 'http://localhost:8788', extraHTTPHeaders: as(member) })
  await ok(mine, 'post', `/api/membership/schemes/${schemeId}/join`, {})
  await mine.dispose()
})

test.describe('as a member', () => {
  test.use({ extraHTTPHeaders: as(member) })

  test('the members\' area home shows the membership card', async ({ page }) => {
    await visit(page, '/members')
    await expect(page.getByText(`Members ${stamp}`)).toBeVisible()
    await page.getByRole('button', { name: 'Show card' }).click()
    await expect(page.getByRole('dialog').getByText('Mo Member')).toBeVisible()
  })

  test.describe('on a phone', () => {
    const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices['iPhone 13']
    test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent })

    test('My membership keeps the scheme readable and puts End membership in the menu', async ({ page }) => {
      await visit(page, '/account/membership')
      const name = page.getByText(`Members ${stamp}`, { exact: true })
      const card = page.getByRole('button', { name: 'Show card' })
      const [n, c] = [await name.boundingBox(), await card.boundingBox()]
      // The buttons wrap under the name rather than squeezing it into a column.
      expect(n && c && c.y > n.y + n.height).toBe(true)
      await page.getByRole('button', { name: `Actions for Members ${stamp}` }).click()
      await expect(page.getByRole('menuitem', { name: 'End membership' })).toBeVisible()
    })
  })
})

test.describe('as an administrator', () => {
  test.use({ extraHTTPHeaders: as(admin) })

  test('a verification list opens with what it holds, and adds an entry from its menu', async ({ page }) => {
    await visit(page, `/admin/modules/membership/lists/${listId}`)
    await expect(page.getByText('Email addresses')).toBeVisible()
    await page.getByRole('button', { name: `Actions for Students ${stamp}` }).click()
    await page.getByRole('menuitem', { name: 'Add entry' }).click()
    await expect(page.getByRole('dialog').getByLabel('Email address')).toBeVisible()
    await page.keyboard.press('Escape')
    // The list key was made with the first list, so a file can be loaded with nothing saved by hand.
    await expect(page.getByText('Lists cannot be used yet')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Load a file' })).toBeEnabled()
  })
})
