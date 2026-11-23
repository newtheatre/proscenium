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

  test('finds Roles and Sign-in under Access', async ({ page }) => {
    await visit(page, '/admin')
    const nav = page.getByRole('navigation', { name: 'Admin', exact: true })
    await nav.getByRole('button', { name: 'Access' }).click() // a group is a collapsible section
    for (const name of ['Roles', 'Sign-in']) await expect(nav.getByRole('link', { name })).toBeVisible()
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
    // Each module folds to its count; Core starts open, the rest are opened here.
    await expect(page.getByRole('button', { name: /^Core · \d+ of \d+ ticked$/ })).toHaveAttribute('aria-expanded', 'true')
    for (const row of await page.getByRole('button', { name: /of \d+ ticked$/, expanded: false }).all()) await row.click()
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

  // Facts and Sign-in are separate tests: Sign-in is a long page of settings, and visiting and
  // checking both pages with axe in one test overran the 30-second limit on a busy CI runner.
  test('automatic access is a tab of Roles, each line folded until it is changed; the old Facts address still arrives', async ({ page }) => {
    await visit(page, '/admin/roles')
    await page.getByRole('tab', { name: 'Automatic access' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Automatic access' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Admin', exact: true }).getByRole('link', { name: 'Facts' })).toHaveCount(0)
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    await page.getByRole('button', { name: /^Change what/ }).first().click()
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
    await noViolations(page)
    await visit(page, '/admin/facts')
    await expect(page).toHaveURL(/\/admin\/roles\/automatic$/)
  })

  test('sign-in settings open', async ({ page }) => {
    await visit(page, '/admin/sign-in')
    await expect(page.getByRole('heading', { level: 1, name: 'Sign-in' })).toBeVisible()
    await noViolations(page)
  })
})

test.describe('someone who looks after the lists', () => {
  test.use(as(['core.vocabulary.manage', 'core.settings.manage']))

  test('a list\'s terms are put in order from the handle or the row\'s menu, and the order is kept', async ({ page }) => {
    const name = `Order ${Date.now()}`
    const { key } = await (await page.request.post('/api/core/vocabularies', { data: { label: name, ordering: 'manual' } })).json() as { key: string }
    for (const label of ['First', 'Second', 'Third']) await page.request.post(`/api/core/vocabularies/${key}/terms`, { data: { label } })
    const saved = async () => ((await (await page.request.get(`/api/core/vocabularies/${key}`)).json()) as { terms: { label: string }[] }).terms.map(t => t.label)
    await visit(page, `/admin/vocabularies/${key}`)
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
    // The arrow keys on the handle move the row one place.
    await page.getByRole('button', { name: 'Move Third', exact: true }).focus()
    await page.keyboard.press('ArrowUp')
    await expect.poll(saved).toEqual(['First', 'Third', 'Second'])
    // The same from the row's menu, so the order never depends on dragging.
    await page.getByRole('button', { name: 'Actions for First' }).click()
    await page.getByRole('menuitem', { name: 'Move down' }).click()
    await expect.poll(saved).toEqual(['Third', 'First', 'Second'])
    await noViolations(page)
  })
})
