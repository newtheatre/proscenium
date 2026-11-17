// A production's poster and photos (C-23, C-24) on its own page in a real browser: an upload is
// checked in the background, described and used; a new poster replaces the old, which can be put
// back; and the section has no accessibility violations in light or dark.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { png } from './images'

const grant = (ability: string) => ({ ability, via: 'test' })
const editor = { kind: 'person', accountId: 'acc_mediaeditor', name: 'Mia Editor', assurance: 'strong', reassertedAt: Date.now(), grants: ['core.production.view', 'core.production.create', 'core.production.edit'].map(grant) }
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })

let productionId = ''
test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(editor) })
  const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  productionId = (await (await api.post('/api/core/productions', { data: { title: `The Poster Play ${RUN}`, kind: 'own' } })).json()).id
  await api.dispose()
})
test.use(as(editor))

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}
const upload = (page: Page, part: 'side-poster' | 'photos', name: string, colour: [number, number, number]) =>
  page.locator(`section[aria-labelledby="${part}-heading"] input[type="file"]`).setInputFiles({ name, mimeType: 'image/png', buffer: png(60, 90, colour) })

test('the poster is managed from the side panel beside every tab, and put back from the Media tab', async ({ page }) => {
  await visit(page, `/console/programme/productions/${productionId}?tab=details`)
  const side = page.getByRole('complementary', { name: 'About this record' })
  // The readiness line links to the Media tab until a poster is in use.
  await expect(side.getByRole('link', { name: 'A poster', exact: true })).toBeVisible()
  await upload(page, 'side-poster', 'first.png', [180, 30, 40])
  await side.getByRole('textbox', { name: /Describe the new poster/ }).fill('A red curtain')
  await side.getByRole('button', { name: 'Use as the poster' }).click()
  await expect(side.getByRole('img', { name: 'A red curtain' })).toBeVisible()
  await expect(side.getByRole('link', { name: 'A poster', exact: true })).toHaveCount(0)
  await expect(side.getByText('A poster', { exact: true })).toBeVisible()

  await upload(page, 'side-poster', 'second.png', [30, 60, 180])
  await side.getByRole('textbox', { name: /Describe the new poster/ }).fill('A blue sky')
  await side.getByRole('button', { name: 'Use as the poster' }).click()
  await expect(side.getByRole('img', { name: 'A blue sky' })).toBeVisible()
  await expect(side.getByRole('img', { name: 'A red curtain' })).toHaveCount(0)
  await noViolations(page)
  await page.getByRole('tab', { name: 'Overview' }).click()
  await page.screenshot({ path: 'test-results/production-record.png' })

  await page.getByRole('tab', { name: 'Media' }).click()
  const tab = page.getByRole('tabpanel')
  await tab.getByRole('button', { name: /Recently removed/ }).click()
  await tab.getByRole('button', { name: 'Put back' }).click()
  await expect(side.getByRole('img', { name: 'A red curtain' })).toBeVisible()
  await expect(tab.getByRole('img', { name: 'A red curtain' })).toBeVisible()
})

test('photos are added and moved on the Media tab, with no accessibility violations in light and dark', async ({ page }) => {
  await visit(page, `/console/programme/productions/${productionId}?tab=media`)
  const media = page.getByRole('main')
  for (const [name, colour, alt] of [['one.png', [20, 120, 60], 'The cast bowing'], ['two.png', [200, 160, 20], 'The set in gold light']] as const) {
    await upload(page, 'photos', name, [...colour])
    await media.getByRole('textbox', { name: /Describe the photo/ }).fill(alt)
    await media.getByRole('button', { name: 'Add to the photos' }).click()
    await expect(media.getByRole('img', { name: alt })).toBeVisible()
  }
  const order = () => page.locator('section[aria-labelledby="photos-heading"] li img').evaluateAll(images => images.map(i => i.getAttribute('alt')))
  expect(await order()).toEqual(['The cast bowing', 'The set in gold light'])
  await media.getByRole('button', { name: 'Move photo 2 earlier' }).click()
  await expect.poll(order).toEqual(['The set in gold light', 'The cast bowing'])
  await noViolations(page)
  await page.screenshot({ path: 'test-results/production-media-light.png', fullPage: true })
  await page.emulateMedia({ colorScheme: 'dark' })
  await noViolations(page)
  await page.screenshot({ path: 'test-results/production-media-dark.png', fullPage: true })
})
