// Identity's People screens in the console (identity spec part 6), in a real browser: each renders
// in the console shell, is in its navigation for those who hold its ability, and passes axe.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (name: string, grants: ReturnType<typeof grant>[]) => ({ kind: 'person', accountId: `acc_${name.toLowerCase().replace(/\W/g, '')}`, name, grants, assurance: 'strong', reassertedAt: Date.now() })
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })

async function visit(page: Page, url: string) {
  const response = await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  return response
}

async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test.describe('Merges', () => {
  test.use(as(person('Morgan Merger', [grant('core.account.merge')])))

  test('is not in the console\'s menu, and lists merges or says there are none', async ({ page }) => {
    await visit(page, '/console/people/merges')
    await expect(page.getByRole('heading', { level: 1, name: 'Merges' })).toBeVisible()
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Merges' })).toHaveCount(0)
    await expect(page.getByText('No merges yet').or(page.getByRole('list', { name: 'Merges' }))).toBeVisible()
    await noViolations(page)
  })
})

test.describe('Merges, for someone who also reads accounts', () => {
  test.use(as(person('Morgan Merger', [grant('core.account.merge'), grant('core.account.read')])))

  test('is reached from Accounts', async ({ page }) => {
    await visit(page, '/console/people')
    await page.getByRole('button', { name: 'More about accounts' }).click()
    await page.getByRole('menuitem', { name: 'Merges' }).click()
    await expect(page).toHaveURL(/\/console\/people\/merges$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Merges' })).toBeVisible()
  })
})

test.describe('Merge accounts', () => {
  test.use(as(person('Morgan Merger', [grant('core.account.merge'), grant('core.account.search')])))

  test('chooses both accounts with the person picker, which searches as you type', async ({ page }) => {
    await visit(page, '/console/people/merges')
    await page.getByRole('link', { name: 'Merge accounts' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Merge accounts' })).toBeVisible()
    await noViolations(page)
    await page.getByRole('button', { name: 'The account to keep' }).click()
    await expect(page.getByText('Type at least three letters')).toBeVisible()
    await page.getByPlaceholder('Name or full email address').fill('Zzyzx Nobody')
    await expect(page.getByText('Nobody matches.')).toBeVisible()
  })
})

test.describe('without the merge ability', () => {
  test.use(as(person('Pat Plain', [grant('core.role.read')])))

  test('Merges is a missing page', async ({ page }) => {
    const response = await visit(page, '/console/people/merges')
    expect(response?.status()).toBe(404)
  })
})
