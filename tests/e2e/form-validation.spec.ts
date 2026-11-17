// Forms are checked by their schema, never by the browser (docs/kit/interface.md, "Checking a form"):
// a bad value shows a plain message beside its field, no browser bubble appears, nothing is sent, and
// what the server refuses lands beside the field too.
import { test, expect, type Page } from '@playwright/test'

const grant = (ability: string) => ({ ability, via: 'test' })
const editor = { kind: 'person', accountId: 'acc_formeditor', name: 'Fern Editor', assurance: 'strong', reassertedAt: Date.now(), grants: ['core.production.view', 'core.production.create', 'core.production.edit'].map(grant) }
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })

let productionId = ''
test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(editor) })
  const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  productionId = (await (await api.post('/api/core/productions', { data: { title: `The Checked Play ${RUN}`, kind: 'own' } })).json()).id
  await api.dispose()
})
test.use(as(editor))

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

test('a booking link that is not a web address is explained beside the field, not by the browser', async ({ page }) => {
  await visit(page, `/console/programme/productions/${productionId}?tab=details`)
  const saves: string[] = []
  page.on('request', (r) => { if (r.method() === 'PATCH') saves.push(r.url()) })
  // Every form leaves checking to its schema.
  expect(await page.locator('form:not([novalidate])').count()).toBe(0)

  const link = page.getByRole('textbox', { name: 'Booking link' })
  await link.fill('not a link')
  await page.getByRole('button', { name: 'Save production' }).click()
  await expect(page.getByText('Enter a web address, such as https://example.org.')).toBeVisible()
  await expect(link).toHaveAttribute('aria-invalid', 'true')
  expect(saves).toEqual([])

  await link.fill('http://tickets.example.org')
  await link.blur()
  await expect(page.getByText('Start it with https://')).toBeVisible()

  // A title left empty says it is needed, rather than the button going grey.
  await page.getByRole('textbox', { name: /^Title/ }).fill('')
  await page.getByRole('button', { name: 'Save production' }).click()
  await expect(page.getByText('This is needed.')).toBeVisible()

  await page.getByRole('textbox', { name: /^Title/ }).fill('The Checked Play')
  await link.fill('https://tickets.example.org/checked')
  await page.getByRole('button', { name: 'Save production' }).click()
  await expect(page.getByText('Production saved', { exact: true })).toBeVisible()
})

test('the server says the same thing in the same words', async ({ request }) => {
  const response = await request.patch(`/api/core/productions/${productionId}`, { data: { externalBookingUrl: 'not a link' } })
  expect(response.status()).toBe(422)
  expect((await response.json()).fields.externalBookingUrl).toBe('Enter a web address, such as https://example.org.')
})
