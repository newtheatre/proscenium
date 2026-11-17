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

test.describe('without core.account.read', () => {
  test.use(as(['core.grant.read']))

  test('Accounts is a missing page', async ({ page }) => {
    const response = await page.goto('/console/people')
    expect(response?.status()).toBe(404)
  })
})
