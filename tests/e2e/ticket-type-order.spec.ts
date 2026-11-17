// Ticket types are put in order by dragging a row's handle (@dnd-kit/vue), from the keyboard with
// Space and the arrow keys, or with the arrow keys on the handle itself. Each way saves the order.
import { test, expect, type Page } from '@playwright/test'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (accountId: string, name: string, abilities: string[]) => ({ kind: 'person', accountId, name, assurance: 'strong', reassertedAt: Date.now(), grants: abilities.map(grant) })
const owner = person('acc_orderowner', 'Order Owner', ['core.settings.manage', 'core.modules.manage'])
const office = person('acc_orderoffice', 'Order Office', ['box-office.pricing.manage', 'box-office.performance.manage'])
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const key = () => ({ 'idempotency-key': crypto.randomUUID() })
// Names are new each time the stage is set, so a retry in a fresh worker starts clean.
let names: string[] = []

test.use(as(office))

test.beforeAll(async ({ playwright }) => {
  const base = { baseURL: 'http://localhost:8788' }
  const settings = await playwright.request.newContext({ ...base, ...as(owner) })
  for (const id of ['finance', 'payments', 'box-office']) expect((await settings.put(`/api/core/modules/${id}`, { data: { on: true } })).ok()).toBe(true)
  await settings.dispose()
  const stamp = crypto.randomUUID().slice(0, 8)
  names = [`Order A ${stamp}`, `Order B ${stamp}`, `Order C ${stamp}`]
  const api = await playwright.request.newContext({ ...base, ...as(office) })
  for (const name of names) expect((await api.post('/api/box-office/ticket-types', { data: { name }, headers: key() })).ok()).toBe(true)
  await api.dispose()
})

async function visit(page: Page) {
  await page.goto('/admin/modules/box-office/ticket-types')
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

/** The three rows' names in the order the screen draws them. */
async function drawn(page: Page) {
  const rows = await page.locator('li', { has: page.locator('[data-drag-handle]') }).allInnerTexts()
  return names.map(n => ({ n, at: rows.findIndex(r => r.includes(n)) })).sort((a, b) => a.at - b.at).map(x => x.n)
}

async function saved(page: Page) {
  const response = await page.request.get('/api/box-office/ticket-types')
  const { ticketTypes } = await response.json() as { ticketTypes: { name: string }[] }
  return ticketTypes.map(t => t.name).filter(n => names.includes(n))
}

test('a ticket type is dragged by its handle, or moved from the keyboard, and the order is kept', async ({ page }) => {
  await visit(page)
  expect(await drawn(page)).toEqual(names)

  // With the mouse: the last row goes to the top.
  const handle = (name: string) => page.getByRole('button', { name: `Move ${name}` })
  const from = await handle(names[2]!).boundingBox()
  const to = await handle(names[0]!).boundingBox()
  expect(from && to).toBeTruthy()
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
  await page.mouse.down()
  await page.mouse.move(from!.x + from!.width / 2, from!.y - 10, { steps: 5 })
  await page.mouse.move(to!.x + to!.width / 2, to!.y - 4, { steps: 15 })
  await page.mouse.up()
  await expect.poll(() => drawn(page)).toEqual([names[2], names[0], names[1]])
  await expect.poll(() => saved(page)).toEqual([names[2], names[0], names[1]])

  // From the keyboard, lifting with Space: the new top row goes down one.
  await handle(names[2]!).focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await expect.poll(() => drawn(page)).toEqual([names[0], names[2], names[1]])
  await expect.poll(() => saved(page)).toEqual([names[0], names[2], names[1]])

  // The arrow keys on the handle, as before.
  await handle(names[1]!).focus()
  await page.keyboard.press('ArrowUp')
  await expect.poll(() => drawn(page)).toEqual([names[0], names[1], names[2]])
  await expect.poll(() => saved(page)).toEqual([names[0], names[1], names[2]])
  await expect(handle(names[1]!)).toBeFocused()
})
