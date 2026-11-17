// Scanning with the camera, in a real browser with a pretend camera that shows a QR code: at the desk
// a reservation's box office code is scanned and the booking opens; at the door a ticket is scanned
// and admitted, then scanned again and found already in. Chromium's fake camera plays a Y4M file,
// which is made here from the code, so what the camera "sees" is a real QR code read by the page.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { encode } from 'uqr'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (accountId: string, name: string, abilities: string[]) => ({ kind: 'person', accountId, name, assurance: 'strong', reassertedAt: Date.now(), grants: abilities.map(grant) })
const owner = person('acc_scanowner', 'Scan Owner', ['core.settings.manage', 'core.modules.manage', 'box-office.settings.manage'])
const manager = person('acc_scanmanager', 'Scan Manager', ['core.production.create', 'core.production.edit', 'core.performance.schedule', 'core.venue.manage', 'box-office.performance.manage', 'box-office.pricing.manage', 'payments.provider.manage'])
const seller = person('acc_scanseller', 'Sam Scanner', ['payments.session.open', 'payments.attempt.attest', 'box-office.order.view', 'box-office.order.sell', 'box-office.order.take-payment', 'box-office.ticket.admit', 'box-office.performance.manage'])
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const base = { baseURL: 'http://localhost:8788' }
const stamp = Date.now() % 1_000_000
let performanceId = ''
let reference = ''
let deskCode = ''
let doorCode = ''

async function post(api: APIRequestContext, path: string, data: unknown, headers: Record<string, string> = {}) {
  const response = await api.post(path, { data, headers: { 'idempotency-key': crypto.randomUUID(), ...headers } })
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
  return response.json()
}

/** A Y4M video of one still frame: the code as a QR code, black on white, filling most of the picture. */
function cameraShowing(code: string, name: string): string {
  const { size, data } = encode(code, { border: 4, ecc: 'M' })
  const side = 480
  const scale = Math.floor(side / size)
  const offset = Math.floor((side - size * scale) / 2)
  const luma = Buffer.alloc(side * side, 235)
  for (let y = 0; y < size * scale; y++) {
    for (let x = 0; x < size * scale; x++) {
      if (data[Math.floor(y / scale)]![Math.floor(x / scale)]) luma[(y + offset) * side + x + offset] = 16
    }
  }
  const chroma = Buffer.alloc((side / 2) * (side / 2), 128)
  const dir = resolve('test-results/camera')
  mkdirSync(dir, { recursive: true })
  const file = resolve(dir, `${name}.y4m`)
  writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${side} H${side} F10:1 Ip A1:1 C420jpeg\nFRAME\n`), luma, chroma, chroma]))
  return file
}

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

async function withCamera(launcher: { launch: (o: object) => Promise<Browser> }, video: string) {
  const browser = await launcher.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] })
  const context = await browser.newContext({ ...base, ...as(seller), permissions: ['camera'] })
  return { browser, page: await context.newPage() }
}

test.beforeAll(async ({ playwright }) => {
  const settings = await playwright.request.newContext({ ...base, ...as(owner) })
  const set = async (changes: { key: string, value: unknown }[]) => expect((await settings.put('/api/core/settings', { data: { changes, confirm: true } })).ok()).toBe(true)
  await set([{ key: 'core.rate-limits.default', value: { count: 10000, per: '1m' } }, { key: 'core.rate-limits.write', value: { count: 10000, per: '1m' } }])
  await set([{ key: 'core.locale.time-zone', value: 'Europe/London' }])
  for (const id of ['finance', 'payments', 'box-office']) expect((await settings.put(`/api/core/modules/${id}`, { data: { on: true } })).ok()).toBe(true)
  await set([{ key: 'box-office.reservations.confirm-email', value: false }, { key: 'box-office.checkout.payment-timing', value: 'buyer-chooses' }])
  await settings.dispose()

  const api = await playwright.request.newContext({ ...base, ...as(manager) })
  const production = await post(api, '/api/core/productions', { title: `The Scanning Show ${stamp}`, kind: 'own' })
  const venue = await post(api, '/api/core/venues', { name: `Scanning Theatre ${stamp}` })
  const performance = await post(api, `/api/core/productions/${production.id}/performances`, { venueId: venue.venueId, spaceId: venue.spaceId, startsAt: Date.now() + 86_400_000, capacity: 100 })
  await post(api, `/api/core/performances/${performance.id}/schedule`, {})
  performanceId = performance.id
  const paid = await post(api, '/api/box-office/ticket-types', { name: `Scan price ${stamp}` })
  const free = await post(api, '/api/box-office/ticket-types', { name: `Scan free ${stamp}` })
  const band = await post(api, `/api/box-office/productions/${production.id}/bands`, { name: 'Stalls' })
  expect((await api.put(`/api/box-office/performances/${performance.id}/sales`, { data: { pools: [{ bandId: band.bandId, capacity: 20 }] } })).ok()).toBe(true)
  await post(api, `/api/box-office/productions/${production.id}/prices`, { prices: [{ bandId: band.bandId, ticketTypeId: paid.ticketTypeId, amountMinor: 1200 }, { bandId: band.bandId, ticketTypeId: free.ticketTypeId, amountMinor: 0 }] })
  await post(api, '/api/payments/providers', { provider: 'cash', label: `Scan cash ${stamp}`, channels: ['desk'], mode: 'live' })
  await post(api, `/api/box-office/performances/${performance.id}/sales/open`, {})
  await api.dispose()

  const buyer = await playwright.request.newContext(base)
  // A reservation, to collect at the desk by scanning its box office code.
  const basket = await post(buyer, '/api/box-office/baskets', { performanceId, lines: [{ bandId: band.bandId, ticketTypeId: paid.ticketTypeId, quantity: 1 }] })
  const reserved = await post(buyer, `/api/box-office/baskets/${basket.orderId}/reserve`, { expectedTotalMinor: 1200, email: `scan.reserve.${stamp}@example.org` }, { 'x-basket-token': basket.token })
  reference = reserved.reference
  deskCode = reserved.deskCode
  // A free ticket, to scan at the door.
  const second = await post(buyer, '/api/box-office/baskets', { performanceId, lines: [{ bandId: band.bandId, ticketTypeId: free.ticketTypeId, quantity: 1 }] })
  const confirmed = await post(buyer, `/api/box-office/baskets/${second.orderId}/checkout`, { expectedTotalMinor: 0, email: `scan.door.${stamp}@example.org` }, { 'x-basket-token': second.token })
  doorCode = confirmed.doorCodes[0]
  await buyer.dispose()

  const till = await playwright.request.newContext({ ...base, ...as(seller) })
  expect([200, 409]).toContain((await till.post('/api/payments/sessions', { data: { pointLabel: 'Scanning desk' }, headers: { 'idempotency-key': crypto.randomUUID() } })).status())
  await till.dispose()
})

test('the desk finds a reservation by scanning its box office code with the camera', async ({ playwright }) => {
  const { browser, page } = await withCamera(playwright.chromium, cameraShowing(deskCode, `desk-${stamp}`))
  try {
    await visit(page, '/console/box-office/sell')
    await page.getByRole('tab', { name: 'Collect a reservation' }).click()
    // Find and the icon-only scan button share the code box's row, lined up with it.
    const box = (await page.getByLabel(/^Booking reference or desk code/).boundingBox())!
    const scanButton = page.getByRole('button', { name: 'Scan with camera' })
    for (const button of [page.getByRole('button', { name: 'Find' }), scanButton]) {
      const at = (await button.boundingBox())!
      expect(Math.abs(at.y + at.height / 2 - (box.y + box.height / 2))).toBeLessThan(2)
    }
    await expect(scanButton).toHaveText('')
    await scanButton.hover()
    await expect(page.getByRole('tooltip')).toContainText('Scan with camera')
    await page.screenshot({ path: 'test-results/desk-find-row.png' })
    await scanButton.click()
    await expect(page.getByRole('heading', { name: `Booking ${reference}` })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel(/^Booking reference or desk code/)).toHaveValue(deskCode)
  }
  finally {
    await browser.close()
  }
})

test('the door admits a ticket scanned with the camera, and knows it when it comes round again', async ({ playwright }) => {
  const { browser, page } = await withCamera(playwright.chromium, cameraShowing(doorCode, `door-${stamp}`))
  try {
    await visit(page, `/console/box-office/performances/${performanceId}/door`)
    await page.getByRole('button', { name: 'Scan tickets' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('status').filter({ hasText: 'Admitted.' })).toBeVisible({ timeout: 15_000 })
    // Held up to the camera, it is still one scan. Shown again later, it is already in.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await page.getByRole('button', { name: 'Scan tickets' }).first().click()
    await expect(page.getByRole('dialog').getByRole('status').filter({ hasText: /Already in, at/ })).toBeVisible({ timeout: 15_000 })
    // Typing is there too: a code that is not ours says so.
    await page.getByRole('dialog').getByLabel('Or type the code').fill('NOT-A-CODE')
    await page.getByRole('dialog').getByRole('button', { name: 'Check' }).click()
    await expect(page.getByRole('dialog').getByRole('status').filter({ hasText: 'This code is not one of ours.' })).toBeVisible()
  }
  finally {
    await browser.close()
  }
})
