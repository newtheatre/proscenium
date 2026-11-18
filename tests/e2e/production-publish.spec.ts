// Publishing a production from its page: Publish says how much is left and opens the same list the
// server checks, asks first with the address the page will have, offers Undo and the public page,
// and once published the side panel says so in place of "Ready to publish?".
import { test, expect, type Page } from '@playwright/test'

const grant = (ability: string) => ({ ability, via: 'test' })
const producer = { kind: 'person', accountId: 'acc_publishproducer', name: 'Pat Producer', assurance: 'strong', reassertedAt: Date.now(), grants: ['core.production.view', 'core.production.create', 'core.production.edit', 'core.production.publish'].map(grant) }
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })

let productionId = ''
let title = ''
test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(producer) })
  const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  title = `The Published Play ${RUN}`
  productionId = (await (await api.post('/api/core/productions', { data: { title, kind: 'own' } })).json()).id
  await api.dispose()
})
test.use(as(producer))

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

test('publish lists what is left, asks first, and the published page says so', async ({ page, request }) => {
  await visit(page, `/console/programme/productions/${productionId}`)
  // Not ready: the window lists each thing still to do, as a list, with no Publish button in it.
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Not ready to publish yet' })
  await expect(dialog.getByRole('listitem').filter({ hasText: 'A summary' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Publish' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close' }).click()

  const { options } = await (await request.get(`/api/core/productions/${productionId}`)).json()
  await request.patch(`/api/core/productions/${productionId}`, { data: { summary: 'A play about publishing.', categoryTermId: options.categories[0].id, effectsConfirmedNone: true, advisoriesConfirmedNone: true, externalBookingUrl: 'https://tickets.example.org/published' } })
  await visit(page, `/console/programme/productions/${productionId}`)

  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: `Publish ${title}?` })
  await expect(confirm.getByRole('link', { name: /^\/whats-on\// })).toBeVisible()
  await confirm.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByText('Production published', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'View public page' }).first()).toBeVisible()

  const side = page.getByRole('complementary', { name: 'About this record' })
  await expect(side.getByRole('heading', { name: 'Published' })).toBeVisible()
  await expect(side.getByRole('heading', { name: 'Ready to publish?' })).toHaveCount(0)
  await expect(side.getByRole('button', { name: 'Withdraw' })).toBeVisible()
})

test('inherited lengths read as the theatre default with Change, and moves that do not apply say why', async ({ page, request }) => {
  const draft = (await (await request.post('/api/core/productions', { data: { title: `The Default Play ${Date.now().toString(36)}`, kind: 'own' } })).json()).id
  await visit(page, `/console/programme/productions/${draft}?tab=details`)
  const form = page.locator('#production-details')
  await expect(form.getByText('Theatre default').first()).toBeVisible()
  await form.getByRole('button', { name: 'Change doors open before' }).click()
  await form.getByRole('button', { name: /^Use theatre default/ }).click()
  await expect(form.getByRole('button', { name: 'Change doors open before' })).toBeVisible()

  await page.getByRole('button', { name: /^More actions for/ }).click()
  await expect(page.getByRole('menuitem', { name: /Withdraw/ })).toBeDisabled()
  await expect(page.getByRole('menuitem', { name: /Cancel production/ })).toContainText('Delete it instead')
  await expect(page.getByRole('menuitem', { name: /Duplicate/ })).toBeEnabled()
})
