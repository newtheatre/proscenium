// Identity's screens in Admin (identity spec part 6): Roles, one role, Facts and
// Sign-in, under the Access group, each opened by its own ability.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const as = (abilities: string[]) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify({ kind: 'person', accountId: 'acc_accessadmin', name: 'Ada Access', grants: abilities.map(grant), assurance: 'strong', reassertedAt: Date.now() }) } })

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
const noViolations = async (page: Page) => expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])

test.describe('someone who reads roles and sets up sign-in', () => {
  test.use(as(['core.role.read', 'core.identity-settings.manage']))

  test('finds Roles, Facts and Sign-in under Access', async ({ page }) => {
    await visit(page, '/admin')
    const nav = page.getByRole('navigation', { name: 'Admin', exact: true })
    await nav.getByRole('button', { name: 'Access' }).click() // a group is a collapsible section
    for (const name of ['Roles', 'Facts', 'Sign-in']) await expect(nav.getByRole('link', { name })).toBeVisible()
  })

  test('the roles list opens, with a way to make one', async ({ page }) => {
    await visit(page, '/admin/roles')
    await expect(page.getByRole('heading', { level: 1, name: 'Roles' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'New role' })).toBeVisible()
    await noViolations(page)
  })

  test('a new role offers the abilities, and the editor cannot give what they do not hold', async ({ page }) => {
    await visit(page, '/admin/roles/new')
    await expect(page.getByRole('heading', { level: 1, name: 'New role' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What it lets holders do' })).toBeVisible()
    await expect(page.getByText('You do not hold this, so you cannot give it').first()).toBeVisible()
    await noViolations(page)
  })

  test('a new role starts from a template, groups Core by task, and a failed create goes to the problem', async ({ page }) => {
    await visit(page, '/admin/roles/new')
    for (const name of ['Programme', 'People', 'Settings', 'Messages']) await expect(page.getByRole('group', { name, exact: true })).toBeVisible()
    // The button stays at the foot of the page; pressing it with no name goes to the name.
    await page.getByRole('button', { name: 'Create role' }).click()
    await expect(page.getByRole('textbox', { name: /^Name/ })).toBeFocused()

    await page.getByRole('combobox', { name: 'Starting point' }).click()
    await page.getByRole('option', { name: 'Producer' }).click()
    await expect(page.getByRole('textbox', { name: /^Name/ })).toHaveValue('Producer')
    await expect(page.getByText(/abilities were left out/)).toBeVisible()
    await noViolations(page)
  })

  test('facts and sign-in settings open', async ({ page }) => {
    await visit(page, '/admin/facts')
    await expect(page.getByRole('heading', { level: 1, name: 'Facts' })).toBeVisible()
    await noViolations(page)
    await visit(page, '/admin/sign-in')
    await expect(page.getByRole('heading', { level: 1, name: 'Sign-in' })).toBeVisible()
    await noViolations(page)
  })
})
