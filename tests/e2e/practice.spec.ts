// Practice mode's frame (PM-10, PM-12, PM-13, T-PM-13, T-PM-16): starting a practice from the list,
// the banner, border and title on every page reached, links kept inside the frame, a page outside the
// scenario fenced off, the panel, and leaving.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const as = (abilities: string[]) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify({ kind: 'person', accountId: 'acc_practiser', name: 'Pat Practice', grants: abilities.map(ability => ({ ability, via: 'test' })), assurance: 'strong', reassertedAt: Date.now() }) } })

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
const noViolations = async (page: Page, within?: string) => expect((await (within ? new AxeBuilder({ page }).include(within) : new AxeBuilder({ page })).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])

async function framed(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: 'Practice · not real' })).toBeVisible()
  await expect(page).toHaveTitle(/^Practice · /)
  const border = page.locator('div[aria-hidden="true"].border-warning')
  await expect(border).toHaveCSS('border-top-width', '4px')
  await expect(border).toHaveCSS('position', 'fixed')
}

test.describe('an administrator checking a practice', () => {
  test.use(as(['core.practice.manage', 'gallery.sample.view', 'gallery.sample.manage']))

  test('starts it from the list, and every page reached is framed', async ({ page }) => {
    await visit(page, '/practice')
    await expect(page.getByText('Checking as an administrator')).toBeVisible()
    await framed(page)
    const card = page.getByRole('listitem').filter({ hasText: 'Practise the sample door' })
    await card.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page).toHaveURL(/\/practice\/live\/gallery$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Sample door' })).toBeVisible()
    await framed(page)
    await noViolations(page)

    // The live page's own links stay in the frame: back to the hub, and to the door again from its tile.
    await page.getByRole('link', { name: 'Back to Tonight' }).click()
    await expect(page).toHaveURL(/\/practice\/live$/)
    await framed(page)
    await page.getByRole('link', { name: 'Sample door' }).click()
    await expect(page).toHaveURL(/\/practice\/live\/gallery$/)

    // A page outside the scenario is not opened (PM-S5).
    await page.evaluate(() => (window as unknown as { useNuxtApp: () => { $router: { push: (to: string) => Promise<unknown> } } }).useNuxtApp().$router.push('/console'))
    await expect(page.getByRole('dialog', { name: 'Not part of this practice' })).toBeVisible()
    await expect(page).toHaveURL(/\/practice\/live\/gallery$/)
    await page.getByRole('button', { name: 'Stay here' }).click()

    // The panel lists the tasks and the outbox, and leaving ends practice and goes back to live mode.
    await page.getByRole('button', { name: 'Practice panel' }).click()
    const panel = page.getByRole('dialog', { name: 'Practise the sample door' })
    await expect(panel.getByText('Admit someone')).toBeVisible()
    await expect(panel.getByText('Emails it would have sent')).toBeVisible()
    // The page behind is dimmed under the panel, so only the panel itself is checked here.
    await noViolations(page, '[role="dialog"]')
    await panel.getByRole('button', { name: 'Leave practice' }).click()
    await expect(page).toHaveURL(/\/live$/)
    await expect(page.getByRole('status').filter({ hasText: 'Practice · not real' })).toHaveCount(0)
  })

  test('says why a practice ended, and starts it again', async ({ page }) => {
    await visit(page, '/practice/gallery.door?ended=1')
    await framed(page)
    await expect(page.getByText(/You left practice|This practice has ended/)).toBeVisible()
    await page.getByRole('button', { name: 'Start again' }).click()
    await expect(page).toHaveURL(/\/practice\/live\/gallery$/)
    await page.getByRole('button', { name: 'Practice panel' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Leave practice' }).click()
    await expect(page).toHaveURL(/\/live$/)
  })
})

test.describe('someone no course opens a practice to', () => {
  test.use(as(['gallery.sample.view', 'gallery.sample.manage']))

  test('is told practice opens through a training course, and is offered no Practise button', async ({ page }) => {
    await visit(page, '/practice')
    await expect(page.getByText('Practice opens through a training course')).toBeVisible()
    await expect(page.getByRole('link', { name: 'My training' })).toBeVisible()
    await visit(page, '/live')
    await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Practise', exact: true })).toHaveCount(0)
  })
})
