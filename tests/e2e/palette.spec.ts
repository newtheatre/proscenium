// The command palette and settings search (UI-09, UI-15) in a real browser, against the gallery build.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (name: string, grants: ReturnType<typeof grant>[]) => ({ kind: 'person', accountId: `acc_${name.toLowerCase().replace(/\W/g, '')}`, name, grants })
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

test.describe('staff with the gallery abilities', () => {
  test.use(as(person('Sam Staff', [grant('gallery.sample.view'), grant('gallery.sample.manage')])))

  test('Ctrl K opens the palette, which lists screens and actions and works by keyboard', async ({ page }) => {
    await visit(page, '/console/gallery/list')
    await page.keyboard.press('Control+k')
    const palette = page.getByRole('dialog')
    await expect(palette).toBeVisible()
    await page.keyboard.type('sample booking')
    // The actions arrive after the palette opens, so wait for the one wanted rather than pressing Enter on whatever is first.
    const action = palette.getByRole('option', { name: /New sample booking/ })
    await expect(action).toBeVisible()
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
    await action.click()
    await expect(page).toHaveURL(/\/console\/gallery\/form/)
  })

  test('finds a record through its search source', async ({ page }) => {
    await visit(page, '/console')
    await page.getByRole('button', { name: 'Search' }).first().click()
    await page.keyboard.type('hamlet')
    await expect(page.getByRole('dialog').getByRole('option').first()).toBeVisible()
  })

  test('the settings search finds a setting by a word in its help and opens it in the console\'s settings window', async ({ page }) => {
    await visit(page, '/console/gallery/list')
    await page.getByRole('button', { name: 'Search' }).first().click()
    await page.getByRole('dialog').getByRole('textbox').fill('seats')
    const hit = page.getByRole('dialog').getByRole('option', { name: /Most seats in one order/ })
    await expect(hit).toBeVisible()
    await hit.click()
    await expect(page).toHaveURL(/settings=gallery&setting=gallery\./)
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Gallery settings' })).toBeVisible()
  })
})

test.describe('an audience account', () => {
  test.use(as(person('Alex Audience', [])))

  test('is offered no actions or record types by the palette endpoint', async ({ request }) => {
    const body = await (await request.get('/api/core/palette')).json()
    expect(body).toEqual({ sources: [], actions: [] })
    const records = await (await request.get('/api/core/records?type=gallery.production&ids=p1')).json()
    expect(records).toEqual({ records: [] })
  })
})
