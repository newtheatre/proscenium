// Admin, the fourth shell (R-33): who may enter, how it differs from the console,
// the site settings page, the palette and the phone layout.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (name: string, grants: ReturnType<typeof grant>[]) => ({ kind: 'person', accountId: `acc_${name.toLowerCase().replace(/\W/g, '')}`, name, grants })
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
// Site settings are privileged, so a site owner has signed in strongly and just now.
const siteOwner = (name: string, extra: string[] = []) => ({ ...person(name, [grant('core.settings.manage'), ...extra.map(grant)]), assurance: 'strong', reassertedAt: Date.now() })

async function visit(page: Page, url: string) {
  const response = await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  return response
}
const noViolations = async (page: Page) => expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])

test.describe('a site owner with no console', () => {
  test.use(as(siteOwner('Sol Site', ['core.audit.view'])))

  test('has the Admin mark, a way back to the site, the overview and no link in a console that is not theirs', async ({ page }) => {
    await visit(page, '/admin')
    await expect(page).toHaveTitle(/^Admin/)
    await expect(page.getByText('Admin', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to the site' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    await expect(page.getByText('Nothing needs attention')).toBeVisible()
    await page.getByRole('navigation', { name: 'Admin', exact: true }).getByRole('button', { name: 'Upkeep' }).click()
    await expect(page.getByRole('navigation', { name: 'Admin', exact: true })).toContainText('Advanced')
    await noViolations(page)
  })

  test('the Advanced page lists the engineering limits, and settings search lands on it', async ({ page }) => {
    await visit(page, '/admin/advanced')
    await expect(page.getByRole('heading', { level: 1, name: 'Advanced' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
    await page.getByRole('searchbox').first().fill('rate')
    await expect(page.getByRole('link').filter({ hasText: /limit/i }).first()).toBeVisible()
    await noViolations(page)
  })

  test('Advanced opens with a warning, and Changed leaves only what differs from its default', async ({ page }) => {
    await visit(page, '/admin/advanced')
    await expect(page.getByText('These are engineering limits')).toBeVisible()
    const shown = await page.getByRole('heading', { level: 2 }).count()
    expect(shown).toBeGreaterThan(1)
    await page.getByRole('switch', { name: 'Show only settings I have changed' }).click()
    await expect(page.getByText('Nothing on this page differs from its default')).toBeVisible()
    await expect(page.locator('form')).toHaveCount(0)
    await noViolations(page)
  })

  test('edits a rate limit as a number of times in a period', async ({ page }) => {
    await visit(page, '/admin/advanced')
    await expect(page.getByText('[object Object]')).toHaveCount(0)
    const count = page.getByRole('spinbutton', { name: 'Rate limit: exports: how many times' })
    // The period is a number and a unit, not text such as "1h".
    const period = page.getByRole('spinbutton', { name: 'Rate limit: exports: in what period: How many' })
    const unit = page.getByRole('combobox', { name: 'Rate limit: exports: in what period: Unit of time' })
    await expect(count).toHaveValue('10')
    await expect(period).toHaveValue('1')
    await expect(unit).toContainText('hour')
    await count.fill('12')
    await count.blur()
    await period.fill('2')
    await period.blur()
    const section = page.locator('form').filter({ has: count })
    await section.getByRole('button', { name: /^Save/ }).click()
    // Rate limits are confirmed: the dialog says what will change, and Go back saves nothing.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Rate limit: exports goes from 10 in 1 hour to 12 in 2 hours.')
    await dialog.getByRole('button', { name: 'Go back' }).click()
    await expect(page.getByText('Saved 1 change')).toHaveCount(0)
    await section.getByRole('button', { name: /^Save/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Save the change' }).click()
    await expect(page.getByText('Saved 1 change', { exact: true })).toBeVisible() // not the toaster's own live-region copy
    await visit(page, '/admin/advanced')
    await expect(page.getByRole('spinbutton', { name: 'Rate limit: exports: how many times' })).toHaveValue('12')
    await expect(period).toHaveValue('2')
    await expect(unit).toContainText('hours')
    await expect(page.getByText('Default: 10 in 1 hour.')).toBeVisible()
    // A period is 1 minute to 1 day: only seconds to days are offered, and the count stays inside
    // what the unit allows, so 2 hours switched to days becomes 1 day.
    await unit.click()
    await expect(page.getByRole('option')).toHaveText(['days', 'hours', 'minutes', 'seconds'])
    await page.getByRole('option', { name: 'days' }).click()
    await expect(period).toHaveValue('1')
    await unit.click()
    await page.getByRole('option', { name: 'second', exact: true }).click() // named for the count, still 1
    await period.fill('5')
    await period.blur()
    await expect(period).toHaveValue('60')
  })

  test('a changed setting shows who changed it, its history opens and Revert puts it back, and Settings history lists the change', async ({ page }) => {
    await visit(page, '/admin/advanced')
    const size = page.getByRole('combobox', { name: 'Rows on a page of a list' })
    await expect(size).toBeVisible()
    await size.click()
    await page.getByRole('option', { name: '50' }).click()
    const section = page.locator('form').filter({ has: size })
    await section.getByRole('button', { name: /^Save/ }).click()
    await expect(page.getByText('Saved 1 change', { exact: true })).toBeVisible()
    await expect(section.getByRole('button', { name: /^Changed by the system, / })).toBeVisible()
    await section.getByRole('button', { name: /^Changed by the system, .*Show the history of Rows on a page of a list/ }).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toContainText('From 25 to 50.')
    await noViolations(page)
    await drawer.getByRole('button', { name: /^Revert Rows on a page of a list/ }).click()
    await expect(page.getByText('Rows on a page of a list reverted', { exact: true })).toBeVisible()
    await expect(drawer).toContainText('From 50 to 25.')
    await page.keyboard.press('Escape')
    await visit(page, '/admin/settings-history')
    await expect(page.getByRole('heading', { level: 1, name: 'Settings history' })).toBeVisible()
    await expect(page.getByText('From 50 to 25.').first()).toBeVisible()
    await noViolations(page)
  })

  test('the site address offers the address the page was loaded on, and Use puts it in the box', async ({ page }) => {
    await visit(page, '/admin/theatre')
    const use = page.getByRole('button', { name: /^Use http/ })
    await expect(use).toBeVisible()
    await use.click()
    await expect(page.getByRole('textbox', { name: "The site's address" })).toHaveValue(/^http/)
  })

  test('a setting with a fixed set of values is a dropdown, searchable when the list is long', async ({ page }) => {
    await visit(page, '/admin/theatre')
    const zone = page.getByRole('button', { name: 'Time zone' })
    await zone.click()
    await page.getByPlaceholder('Search…').fill('London')
    await expect(page.getByRole('option', { name: /^Europe\/London \(GMT/ })).toBeVisible()
    await page.keyboard.press('Escape')
    const language = page.getByRole('combobox', { name: 'Language' })
    await expect(language).toContainText('British English')
    await language.click()
    await expect(page.getByRole('option')).toHaveText(['British English'])
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Currency' })).toContainText('GBP: British Pound')
    await noViolations(page)
  })

  test('is not offered the console', async ({ page }) => {
    await visit(page, '/admin')
    expect((await page.goto('/console'))?.status()).toBe(404)
  })
})

test.describe('staff who also run the console', () => {
  test.use(as(siteOwner('Sky Staff', ['gallery.sample.view'])))

  test('move between the shells from the account menu, and the console sidebar has no link in', async ({ page }) => {
    await visit(page, '/console')
    expect(await page.getByRole('navigation', { name: 'Console' }).innerText()).not.toContain('Admin')
    await page.getByRole('button', { name: /Open the menu for Sky Staff/ }).first().click()
    await page.getByRole('menuitem', { name: 'Admin', exact: true }).click()
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('link', { name: 'Back to console' })).toBeVisible()
  })

  test('the palette names the shell of each screen', async ({ page }) => {
    await visit(page, '/admin')
    await page.keyboard.press('Control+k')
    // The palette takes the focus as it opens; typing sooner goes nowhere.
    await expect(page.getByRole('dialog').getByRole('textbox')).toBeFocused()
    await page.keyboard.type('Advanced')
    await expect(page.getByRole('dialog').getByRole('option', { name: /Advanced/ }).first()).toBeVisible()
    await expect(page.getByRole('dialog')).toContainText('Admin')
  })
})

test.describe('a person with no admin ability', () => {
  test.use(as(person('Nia None', [grant('gallery.sample.view')])))

  test('finds /admin is not there, and no menu entry for it', async ({ page }) => {
    expect((await page.goto('/admin'))?.status()).toBe(404)
    await visit(page, '/console')
    await page.getByRole('button', { name: /Open the menu for Nia None/ }).first().click()
    await expect(page.getByRole('menuitem', { name: 'Admin', exact: true })).toHaveCount(0)
  })
})

test.describe('on a phone, in dark mode', () => {
  test.use({ ...as(siteOwner('Pip Phone')), viewport: { width: 390, height: 844 }, colorScheme: 'dark' })

  test('has one header with one menu button, and the drawer opens from it', async ({ page }) => {
    await visit(page, '/admin')
    // The Admin mark gives way to the page's own name on a phone.
    await expect(page.locator('#main').getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('#main').getByText('Admin', { exact: true }).first()).toBeHidden()
    const toggle = page.getByRole('button', { name: 'Open sidebar' })
    await expect(toggle).toHaveCount(1)
    await toggle.click()
    await expect(page.getByRole('link', { name: 'Back to the site' })).toBeVisible()
    await page.getByRole('link', { name: 'Advanced' }).click()
    await expect(page).toHaveURL(/\/admin\/advanced/)
    await noViolations(page)
  })
})

test.describe('keys typed into the app', () => {
  test.use(as(siteOwner('Kit Keys', ['core.identity-settings.manage'])))

  test('Sign-in takes the Turnstile secret key, shows it as dots and its last four characters, replaces and removes it', async ({ page }) => {
    await visit(page, '/admin/sign-in')
    const card = page.locator('form').filter({ has: page.getByRole('heading', { level: 2, name: 'Keys' }) })
    await expect(card.getByLabel('Turnstile secret key')).toBeVisible()
    await expect(card.getByLabel('Google client secret')).toBeVisible()
    await card.getByLabel('Turnstile secret key').fill('0x4AAAAAAAe2eabcdefghij4321')
    await card.getByRole('button', { name: 'Save keys' }).click()
    await expect(page.getByText('Keys saved', { exact: true }).first()).toBeVisible()
    await expect(card.getByLabel('Turnstile secret key')).toHaveValue('••••••••••••4321')
    await noViolations(page)
    await card.getByRole('button', { name: 'Replace' }).click()
    await expect(card.getByLabel('Turnstile secret key')).toHaveValue('')
    await card.getByRole('button', { name: 'Cancel' }).click()
    await expect(card.getByLabel('Turnstile secret key')).toHaveValue('••••••••••••4321')
    await card.getByRole('button', { name: 'Remove' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove key' }).click()
    await expect(page.getByText('Key removed', { exact: true }).first()).toBeVisible()
    await expect(card.getByLabel('Turnstile secret key')).toHaveValue('')
    await expect(card.getByText('Not set').first()).toBeVisible()
  })
})

test.describe('the Branding screen', () => {
  test.use(as(siteOwner('Bea Brand', ['core.branding.edit'])))

  test('offers logo uploads and a preview before saving, and hides what the system keeps', async ({ page }) => {
    // The screen carries live previews of the brand, which the accessibility check reads frame by frame.
    test.setTimeout(60_000)
    await visit(page, '/admin/branding')
    await expect(page.getByRole('heading', { level: 1, name: 'Branding' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Upload a logo' })).toHaveCount(2)
    await expect(page.getByText('Brand revision')).toHaveCount(0)
    await expect(page.getByText('Set on the brand screen')).toHaveCount(0)
    // Who may change the brand is said once for each section, not under every field.
    await expect(page.getByText('Changed by people who can: Change the brand.')).toHaveCount(2)
    await expect(page.getByRole('figure').filter({ hasText: 'Light' })).toBeVisible()
    await page.getByRole('combobox', { name: 'Corners' }).click()
    await page.getByRole('option', { name: 'Square' }).click()
    await expect(page.getByText('1 change', { exact: true })).toBeVisible()
    // Check once the menu has closed: while it is open the rest of the page is hidden from assistive tech.
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await noViolations(page)
  })
})
