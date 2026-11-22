// Someone who holds an ability that needs a strong sign-in, but whose account has no two-step sign-in,
// is told so and where to set it up: by the server, in the console before they try, and on a refusal.
import { test, expect, type Page } from '@playwright/test'

const grant = (ability: string) => ({ ability, via: 'test' })
const manager = (twoStep: boolean) => ({ kind: 'person', accountId: `acc_twostep${twoStep ? 'has' : 'none'}`, name: 'Mo Manager', assurance: 'basic', twoStep, grants: ['core.modules.manage', 'core.health.view', 'gallery.sample.view'].map(grant) })
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

test.describe('a manager with no two-step sign-in', () => {
  test.use(as(manager(false)))

  test('is refused with the reason and a different code from "no permission"', async ({ page }) => {
    const refused = await page.request.put('/api/core/modules/gallery', { data: { on: true } })
    expect(refused.status()).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'core.access.two-step-not-set-up', reason: 'This needs two-step sign-in.' })
  })

  test('is told in the console, with the way to set it up', async ({ page }) => {
    await visit(page, '/console/gallery/list')
    await expect(page.getByText('Some of what you can do here needs two-step sign-in, which your account does not have yet.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Set it up' })).toHaveAttribute('href', '/account/sign-in')
  })
})

test.describe('a manager who has a passkey but did not use it', () => {
  test.use(as(manager(true)))

  test('is asked for the stronger sign-in, not to set one up', async ({ page }) => {
    const refused = await page.request.put('/api/core/modules/gallery', { data: { on: true } })
    expect((await refused.json()).code).toBe('core.access.needs-strong-sign-in')
    await visit(page, '/console/gallery/list')
    await expect(page.getByText('Some of what you can do here needs a stronger sign-in than the one you used.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirm it is you' })).toBeVisible()
  })
})
