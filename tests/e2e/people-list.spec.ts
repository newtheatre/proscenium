// The console's Accounts list (Identity Doc part 5): the People group's first entry, a declared list
// with views for the accounts it hides by default.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const as = (abilities: string[]) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify({ kind: 'person', accountId: 'acc_peoplereader', name: 'Pat People', grants: abilities.map(grant), assurance: 'strong', reassertedAt: Date.now() }) } })

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
const noViolations = async (page: Page) => expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])

test.describe('someone who reads accounts', () => {
  test.use(as(['core.account.read']))

  test('finds Accounts under People and opens the list with its views', async ({ page }) => {
    await visit(page, '/console/people')
    await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible()
    for (const name of ['People', 'Not yet signed in', 'Erased', 'All']) await expect(page.getByRole('tab', { name })).toBeVisible()
    await expect(page.getByRole('search')).toBeVisible()
    await noViolations(page)
  })

  test('a view is kept in the address', async ({ page }) => {
    await visit(page, '/console/people')
    await page.getByRole('tab', { name: 'Not yet signed in' }).click()
    await expect(page).toHaveURL(/view=unclaimed/)
  })
})

test.describe('someone who reads and disables accounts', () => {
  test.use(as(['core.account.read', 'core.account.create', 'core.account.disable']))

  test('opens a person from the list, sees their addresses, and can disable them', async ({ page }) => {
    const name = `Rhiannon Pagetest ${Date.now()}`
    const made = await page.request.post('/api/core/accounts', { data: { name, address: `rhiannon.${Date.now()}@example.org` } })
    expect(made.ok()).toBe(true)
    const { id } = await made.json() as { id: string }
    await visit(page, '/console/people')
    // Not yet signed in, so hidden from the default view, which says so and links to it.
    await page.getByRole('link', { name: /not yet signed in$/ }).first().click()
    await expect(page).toHaveURL(/view=unclaimed/)
    await page.getByRole('link', { name }).click()
    await expect(page).toHaveURL(new RegExp(`/console/people/${id}`))
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Email addresses' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'How they sign in' })).toBeVisible()
    await noViolations(page)
    await page.getByRole('button', { name: /more actions|actions/i }).first().click()
    await page.getByRole('menuitem', { name: 'Disable account' }).click()
    await page.getByRole('radio', { name: 'They asked' }).check()
    await page.getByRole('dialog').getByRole('button', { name: 'Disable account' }).click()
    await expect(page.getByText(/^Disabled since/)).toBeVisible()
  })
})

test.describe('someone who reads grants', () => {
  test.use(as(['core.grant.read']))

  test('opens Who holds what with its views, and not Accounts', async ({ page }) => {
    await visit(page, '/console/people/grants')
    await expect(page.getByRole('heading', { level: 1, name: 'Who holds what' })).toBeVisible()
    for (const name of ['Current', 'About to lapse', 'Ended']) await expect(page.getByRole('tab', { name })).toBeVisible()
    await noViolations(page)
    // Reading grants is not giving them.
    await expect(page.getByRole('button', { name: 'Give a role' })).toHaveCount(0)
    // Someone with a console sees a refusal, not a missing page.
    const response = await page.goto('/console/people')
    expect(response?.status()).toBe(403)
  })
})

test.describe('someone who gives roles', () => {
  test.use(as(['core.grant.read', 'core.grant.manage', 'core.account.search', 'core.account.read', 'core.account.create']))

  test('gives a role from Who holds what and from a person\'s page', async ({ page }) => {
    await visit(page, '/console/people/grants')
    await page.getByRole('button', { name: 'Give a role' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Give a role' })).toBeVisible()
    await expect(dialog.getByText('Person')).toBeVisible()
    await expect(dialog.getByText('Role', { exact: true })).toBeVisible()
    // Pressing the button says what is missing, beside each field.
    await dialog.getByRole('button', { name: 'Give role' }).click()
    await expect(dialog.getByText(/required|needed/i).first()).toBeVisible()
    await noViolations(page)

    const name = `Gina Granttest ${Date.now()}`
    const made = await page.request.post('/api/core/accounts', { data: { name, address: `gina.${Date.now()}@example.org` } })
    const { id } = await made.json() as { id: string }
    await visit(page, `/console/people/${id}`)
    await page.getByRole('button', { name: 'Give a role' }).click()
    await expect(page.getByRole('dialog').getByRole('heading', { name: `Give ${name} a role` })).toBeVisible()
  })

  test('?give=1 opens Give a role, and the flag leaves the address', async ({ page }) => {
    await visit(page, '/console/people/grants?give=1')
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Give a role' })).toBeVisible()
    await expect(page).not.toHaveURL(/give=1/)
  })
})

test.describe('someone who handles data requests', () => {
  test.use(as(['core.data-request.manage', 'core.account.create']))

  test('opens Data requests with its views, and can start an erasure from a person\'s page', async ({ page }) => {
    await visit(page, '/console/people/data-requests')
    await expect(page.getByRole('heading', { level: 1, name: 'Data requests' })).toBeVisible()
    for (const name of ['Open', 'Overdue', 'Closed', 'All']) await expect(page.getByRole('tab', { name })).toBeVisible()
    await noViolations(page)
    await page.getByRole('tab', { name: 'Overdue' }).click()
    await expect(page).toHaveURL(/view=overdue/)

    const name = `Elin Erasetest ${Date.now()}`
    const made = await page.request.post('/api/core/accounts', { data: { name, address: `elin.${Date.now()}@example.org` } })
    const { id } = await made.json() as { id: string }
    await visit(page, `/console/people/${id}`)
    await page.getByRole('button', { name: /more actions|actions/i }).first().click()
    await page.getByRole('menuitem', { name: 'Start an erasure' }).click()
    await expect(page.getByRole('dialog').getByRole('radio', { name: 'Seen in person' })).toBeChecked()
    await noViolations(page)
  })
})

test.describe('someone who merges accounts', () => {
  test.use(as(['core.account.merge', 'core.account.create']))

  test('starts a merge from a person\'s page, keeping that person', async ({ page }) => {
    const made = await page.request.post('/api/core/accounts', { data: { name: `Mira Mergetest ${Date.now()}`, address: `mira.${Date.now()}@example.org` } })
    const { id } = await made.json() as { id: string }
    await visit(page, `/console/people/${id}`)
    await expect(page.getByRole('heading', { name: 'Members\' side' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Emergency contacts' })).toHaveCount(0)
    await noViolations(page)
    await page.getByRole('button', { name: /more actions|actions/i }).first().click()
    await page.getByRole('menuitem', { name: 'Merge with another account' }).click()
    await expect(page).toHaveURL(new RegExp(`/console/people/merge\\?survivorId=${id}`))
  })
})

test.describe('without core.account.read', () => {
  test.use(as(['core.role.read']))

  test('Accounts is a missing page', async ({ page }) => {
    const response = await page.goto('/console/people')
    expect(response?.status()).toBe(404)
  })
})
