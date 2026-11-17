// Webhooks in Admin (C-49 to C-51): listed under Connections, added with an address and events, the
// signing secret shown once, a refused address explained, and pausing.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const as = (abilities: string[]) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify({ kind: 'person', accountId: 'acc_hookadmin', name: 'Hal Hooks', grants: abilities.map(ability => ({ ability, via: 'test' })), assurance: 'strong', reassertedAt: Date.now() }) } })

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
const noViolations = async (page: Page) => {
  await page.mouse.move(0, 0) // a primary button's hover shade is not what is being checked
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test.describe('someone who looks after webhooks', () => {
  test.use(as(['core.webhook.manage']))

  test('finds Webhooks in Admin, with its settings', async ({ page }) => {
    await visit(page, '/admin')
    const nav = page.getByRole('navigation', { name: 'Admin', exact: true })
    await nav.getByRole('link', { name: 'Webhooks' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Webhooks' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Webhook settings' })).toBeVisible()
    await expect(page.getByText('Failures before a webhook is paused')).toBeVisible()
    await noViolations(page)
  })

  test('adds one, sees the secret once, and pauses it', async ({ page }) => {
    const name = `Hook ${Date.now()}`
    await visit(page, '/admin/webhooks/new')
    await expect(page.getByRole('heading', { level: 1, name: 'Add webhook' })).toBeVisible()
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Address').fill('http://hooks.example.org/in')
    await page.getByRole('checkbox', { name: 'Everything from Core' }).check()
    await noViolations(page)
    await page.getByRole('button', { name: 'Add webhook' }).click()
    await expect(page.getByText('The address must start https://')).toBeVisible()

    await page.getByLabel('Address').fill('https://hooks.example.org/in')
    await page.getByRole('button', { name: 'Add webhook' }).click()
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'The signing secret' })).toHaveValue(/^whsec_/)
    await expect(page.getByText('Leave empty to keep sending to hooks.example.org')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Delivery log' })).toBeVisible()
    await noViolations(page)

    await page.getByRole('button', { name: 'Pause' }).click()
    await expect(page.getByText('Paused. Events are not sent')).toBeVisible()
    // Undo on the toast resumes it; pausing again leaves it paused.
    await page.getByRole('region', { name: /Notifications/ }).getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByText('Paused. Events are not sent')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
    await page.getByRole('button', { name: 'Pause' }).click()
    await expect(page.getByText('Paused. Events are not sent')).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'The signing secret' })).toHaveCount(0)

    await visit(page, '/admin/webhooks')
    await expect(page.getByRole('link', { name })).toBeVisible()
  })
})

test('without the ability, webhooks are not offered', async ({ browser }) => {
  const page = await browser.newPage(as(['core.role.read']))
  await page.goto('/admin/webhooks')
  await expect(page.getByRole('heading', { level: 1, name: 'Webhooks' })).toHaveCount(0)
  await page.close()
})
