// The console's and Admin's sidebars: sections, the foot (links and the account
// menu), and where the way back sits.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (name: string, grants: ReturnType<typeof grant>[]) => ({ kind: 'person', accountId: `acc_${name.toLowerCase().replace(/\W/g, '')}`, name, grants })
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
const noViolations = async (page: Page) => expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => v.id)).toEqual([])

test.describe('console staff who are not administrators', () => {
  test.use(as(person('Cass Console', [grant('gallery.sample.view')])))

  test('the foot has Documentation and the account menu, and no Admin link', async ({ page }) => {
    await visit(page, '/console')
    const foot = page.getByRole('navigation', { name: 'Help and administration' })
    await expect(foot.getByRole('link', { name: 'Documentation' })).toBeVisible()
    await expect(foot.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
    const menu = page.getByRole('button', { name: /Open the menu for Cass Console/ })
    const box = (await menu.boundingBox())!
    expect(box.y).toBeGreaterThan(page.viewportSize()!.height / 2) // at the bottom of the sidebar, not the navbar
    await noViolations(page)
  })

  test('a group is a section that opens, and the group holding the page starts open', async ({ page }) => {
    await visit(page, '/console/gallery/list')
    await expect(page.getByRole('navigation', { name: 'Console' }).getByRole('link', { name: 'Sample list' })).toBeVisible()
    await visit(page, '/console')
    await expect(page.getByRole('navigation', { name: 'Console' }).getByRole('link', { name: 'Sample list' })).toBeHidden()
  })
})

test.describe('a site owner who runs the console', () => {
  test.use(as({ ...person('Ola Owner', [grant('gallery.sample.view'), grant('core.settings.manage')]), assurance: 'strong', reassertedAt: Date.now() }))

  test('the console foot links to Admin, and there the way back sits at the foot beside the account menu', async ({ page }) => {
    await visit(page, '/console')
    const foot = page.getByRole('navigation', { name: 'Help and administration' })
    const docsHere = (await foot.getByRole('link', { name: 'Documentation' }).boundingBox())!
    expect(docsHere.y).toBeLessThan((await foot.getByRole('link', { name: 'Admin', exact: true }).boundingBox())!.y)
    await foot.getByRole('link', { name: 'Admin', exact: true }).click()
    await expect(page).toHaveURL(/\/admin$/)
    const back = page.getByRole('link', { name: 'Back to console' })
    await expect(back).toBeVisible()
    expect((await back.boundingBox())!.y).toBeGreaterThan(page.viewportSize()!.height / 2)
    await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0) // its own link is not repeated
    // The link to the other shell sits beneath Documentation here as it does in the console.
    const docs = (await page.getByRole('link', { name: 'Documentation' }).boundingBox())!
    expect(docs.y).toBeLessThan((await back.boundingBox())!.y)
    await noViolations(page)
    await back.click()
    await expect(page).toHaveURL(/\/console$/)
  })
})
