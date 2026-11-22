// A production's credits are put in order by dragging, with the same moves on the handle's arrow keys
// and in each row's menu, so the order never depends on a pointer.
import { test, expect, type Page } from '@playwright/test'

const grant = (ability: string) => ({ ability, via: 'test' })
const producer = { kind: 'person', accountId: 'acc_creditproducer', name: 'Casey Credits', assurance: 'strong', reassertedAt: Date.now(), grants: ['core.production.view', 'core.production.create', 'core.production.edit'].map(grant) }
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })

let productionId = ''
test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(producer) })
  const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  productionId = (await (await api.post('/api/core/productions', { data: { title: `Credited Play ${RUN}`, kind: 'own' } })).json()).id
  const { sections } = await (await api.get(`/api/core/productions/${productionId}/credits`)).json() as { sections: { id: string, retired: boolean }[] }
  const sectionTermId = sections.find(s => !s.retired)!.id
  for (const creditedName of ['Ada First', 'Ben Second', 'Cy Third']) {
    const made = await api.post(`/api/core/productions/${productionId}/credits`, { data: { creditedName, role: 'Actor', sectionTermId, visibility: 'public', accountId: null } })
    expect(made.ok()).toBe(true)
  }
  await api.dispose()
})
test.use(as(producer))

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
const order = (page: Page) => page.locator('[aria-label^="Drag to move"]').evaluateAll(els => els.map(e => (e.getAttribute('aria-label') ?? '').replace('Drag to move ', '')))

test('credits move by the handle\'s arrow keys and from the row\'s menu, and the order is kept', async ({ page }) => {
  await visit(page, `/console/programme/productions/${productionId}?tab=credits`)
  await expect.poll(() => order(page)).toEqual(['Ada First', 'Ben Second', 'Cy Third'])
  await page.getByRole('button', { name: 'Drag to move Cy Third' }).focus()
  await page.keyboard.press('ArrowUp')
  await expect.poll(() => order(page)).toEqual(['Ada First', 'Cy Third', 'Ben Second'])
  await page.getByRole('button', { name: 'Actions for Ada First' }).click()
  await expect(page.getByRole('menuitem', { name: 'Move up' })).toBeDisabled()
  await page.getByRole('menuitem', { name: 'Move down' }).click()
  await expect.poll(() => order(page)).toEqual(['Cy Third', 'Ada First', 'Ben Second'])
  await page.reload()
  await expect.poll(() => order(page)).toEqual(['Cy Third', 'Ada First', 'Ben Second'])
})
