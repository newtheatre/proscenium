// Codes and discounts at the till, on a phone: the sale sits in a sheet at the foot of the screen,
// a code is added from it and takes its saving off, and the sheet is swiped down to close.
import { test, expect, devices, type APIRequestContext, type Page } from '@playwright/test'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (accountId: string, name: string, abilities: string[]) => ({ kind: 'person', accountId, name, assurance: 'strong', reassertedAt: Date.now(), grants: abilities.map(grant) })
const owner = person('acc_tillowner', 'Till Owner', ['core.settings.manage', 'core.modules.manage', 'payments.settings.manage', 'payments.provider.manage', 'bar.product.manage', 'bar.price.manage', 'bar.outlet.manage', 'promotions.promotion.manage'])
const seller = person('acc_tillseller', 'Tia Seller', ['bar.sale.sell', 'payments.session.open', 'payments.attempt.attest'])
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const key = () => ({ 'idempotency-key': crypto.randomUUID() })

async function post(api: APIRequestContext, url: string, data: object) {
  const response = await api.post(url, { data, headers: key() })
  expect(response.ok(), `${url}: ${await response.text()}`).toBe(true)
  return await response.json()
}

const run = Date.now().toString(36)
const juice = `Juice ${run}`
const code = `TILL${run}`.toUpperCase().slice(0, 32)

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(owner) })
  await api.put('/api/core/settings', { data: { changes: [{ key: 'core.rate-limits.default', value: 10000 }, { key: 'core.rate-limits.write', value: 10000 }] } })
  for (const id of ['finance', 'payments', 'bar', 'promotions']) expect((await api.put(`/api/core/modules/${id}`, { data: { on: true } })).ok()).toBe(true)
  await post(api, '/api/payments/providers', { provider: 'cash', label: 'Till cash', channels: ['desk'], mode: 'live' })
  const soft = await post(api, '/api/bar/categories', { name: `Juices ${run}`, colour: 'info' })
  const product = await post(api, '/api/bar/products', { categoryId: soft.categoryId, name: juice, amountMinor: 300 })
  const outlets = await (await api.get('/api/bar/outlets')).json()
  if (!outlets.outlets?.length) await post(api, '/api/bar/outlets', { name: `Foyer bar ${run}`, kind: 'bar' })
  await post(api, '/api/promotions', { name: `Till code ${run}`, label: 'Pound off', trigger: 'code', effect: 'amount_off', value: 100, codes: [{ code }], targets: [{ role: 'applies', kind: 'bar.item', scope: { productId: product.productId } }] })
  await api.dispose()
})

test.use({ ...devices['Pixel 7'], ...as(seller) })

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

// A finger dragging down from a point, as a phone sends it (touch, not a mouse).
async function swipeDown(page: Page, x: number, y: number, distance: number) {
  const cdp = await page.context().newCDPSession(page)
  const point = (dy: number) => [{ x, y: y + dy, id: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(0) })
  for (let step = 1; step <= 12; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point((distance * step) / 12) })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test('a code is added from the sale sheet and takes its saving off', async ({ page }) => {
  await visit(page, '/live/till')
  await page.getByRole('button', { name: new RegExp(`^${juice}`) }).click()
  await page.getByRole('button', { name: /^Sale/ }).click()
  const sheet = page.getByRole('dialog', { name: /^Sale/ })
  await sheet.getByRole('button', { name: 'Add a code or discount' }).click()

  const window = page.getByRole('dialog', { name: 'Add a code or discount' })
  await window.getByRole('textbox').fill(code.toLowerCase())
  await window.getByRole('button', { name: 'Apply' }).click()
  await expect(window).toHaveCount(0)
  await expect(page.getByText(/Pound off/).first()).toBeVisible()
  await expect(page.getByText('£2.00', { exact: true }).first()).toBeVisible()
})

test('the sale sheet closes when swiped down', async ({ page }) => {
  await visit(page, '/live/till')
  await page.getByRole('button', { name: new RegExp(`^${juice}`) }).click()
  await page.getByRole('button', { name: /^Sale/ }).click()
  const sheet = page.getByRole('dialog', { name: /^Sale/ })
  await expect(sheet).toBeVisible()
  await page.waitForTimeout(1000) // the sheet's opening slide, after which it takes a drag
  const box = (await sheet.getByText('Total', { exact: true }).boundingBox())!
  await swipeDown(page, box.x + 10, box.y + box.height / 2, 400)
  await expect(sheet).toHaveCount(0)
})

test('a sale too long for the sheet scrolls, and the sheet still swipes closed from its header', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 480 }) // a phone on its side
  await visit(page, '/live/till')
  await page.getByRole('button', { name: new RegExp(`^${juice}`) }).click()
  await page.getByRole('button', { name: /^Sale/ }).click()
  const sheet = page.getByRole('dialog', { name: /^Sale/ })
  await expect(sheet).toBeVisible()
  const body = sheet.locator('[data-slot="body"]')
  await expect.poll(() => body.evaluate(e => getComputedStyle(e).overflowY)).toBe('auto')
  expect(await body.evaluate(e => e.scrollHeight > e.clientHeight)).toBe(true)
  await page.waitForTimeout(1000)
  const title = (await sheet.locator('[data-slot="title"]').boundingBox())!
  await swipeDown(page, title.x + 10, title.y + title.height / 2, 400)
  await expect(sheet).toHaveCount(0)
})
