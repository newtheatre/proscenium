// The money screens in a real browser: Payments' and Finance's console pages load for someone who
// holds their abilities, have no accessibility violations, and a till session opens from My session.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const treasurer = {
  kind: 'person',
  accountId: 'acc_terrytreasurer',
  name: 'Terry Treasurer',
  assurance: 'strong',
  reassertedAt: Date.now(),
  grants: [
    'payments.session.open', 'payments.session.view', 'payments.session.close-any', 'payments.attempt.reconcile',
    'payments.attempt.attest', 'payments.refund.approve', 'payments.provider.manage', 'gallery.sample.view',
    'finance.ledger.view', 'finance.ledger.export', 'finance.account.manage', 'finance.period.close', 'finance.period.reopen', 'finance.posting.correct',
    'payments.settings.manage', 'finance.settings.manage',
  ].map(grant),
}
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })

test.beforeAll(async ({ playwright }) => {
  const owner = { kind: 'person', accountId: 'acc_moneyowner', name: 'Money Owner', assurance: 'strong', reassertedAt: Date.now(), grants: [grant('core.settings.manage'), grant('core.modules.manage')] }
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(owner) })
  await api.put('/api/core/settings', { data: { changes: [{ key: 'core.rate-limits.default', value: 10000 }] } })
  // The till posts a sale to the ledger, which dates it in the theatre's time zone.
  expect((await api.put('/api/core/settings', { data: { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }], confirm: true } })).ok()).toBe(true)
  for (const id of ['finance', 'payments']) expect((await api.put(`/api/core/modules/${id}`, { data: { on: true } })).ok()).toBe(true)
  await api.dispose()
})
test.use(as(treasurer))

async function visit(page: Page, url: string) {
  const response = await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  return response
}

async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

const SCREENS = [
  ['/console/payments/till', 'Till'],
  ['/console/payments/session', 'My session'],
  ['/console/payments/sessions', 'Till sessions'],
  ['/console/payments/attention', 'Needs attention'],
  ['/console/payments/refunds', 'Refunds'],
  ['/console/payments/providers', 'Providers and readers'],
  ['/console/finance/ledger', 'Ledger'],
  ['/console/finance/accounts', 'Ledger accounts'],
  ['/console/finance/periods', 'Periods'],
  ['/console/finance/productions', 'Production statements'],
  ['/console/finance/reconcile', 'Reconciliation'],
  ['/console/finance/export', 'Export'],
  ['/console/payments/settings', 'Payments'],
  ['/console/finance/settings', 'Finance'],
] as const

for (const [path, title] of SCREENS) {
  test(`${title} loads, sits in the Money group and has no violations`, async ({ page }) => {
    const response = await visit(page, path)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expect(page.getByRole('link', { name: title }).first()).toBeVisible()
    await noViolations(page)
  })
}

test('My session opens a till with a float and shows the cash expected', async ({ page }) => {
  await visit(page, '/console/payments/session')
  await page.getByRole('textbox', { name: /^Till/ }).fill('Box office desk')
  await page.getByLabel(/^Float/).fill('50')
  await page.getByRole('button', { name: 'Open session' }).click()
  await expect(page.getByRole('heading', { name: 'Box office desk' })).toBeVisible()
  await expect(page.getByText('£50.00').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start counting' })).toBeEnabled()
  await noViolations(page)
})

test('the Till sells from a panel and takes cash for the total', async ({ page, playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(treasurer) })
  const key = () => ({ 'idempotency-key': crypto.randomUUID() })
  expect((await api.post('/api/payments/providers', { data: { provider: 'cash', label: 'Cash drawer', channels: ['desk'], mode: 'live' }, headers: key() })).ok()).toBe(true)
  const opened = await api.post('/api/payments/sessions', { data: { pointLabel: 'Foyer desk' }, headers: key() })
  expect([200, 409]).toContain(opened.status())
  await api.dispose()

  await visit(page, '/console/payments/till')
  await expect(page.getByRole('heading', { name: 'Gallery programmes' })).toBeVisible()
  await page.getByLabel('Programmes sold').fill('2')
  await page.getByLabel('Programmes sold').blur()
  await expect(page.getByRole('button', { name: 'Take payment of £6.00' })).toBeEnabled()
  await noViolations(page)
  await page.getByRole('button', { name: 'Take payment of £6.00' }).click()
  await expect(page.getByText('Still to pay: £6.00')).toBeVisible()
  await page.getByRole('radio', { name: 'Cash' }).first().check() // other browser tests may have added a cash drawer too
  await page.getByLabel(/^Cash handed over/).fill('10')
  await noViolations(page)
  await page.getByRole('button', { name: 'Cash taken' }).click()
  await expect(page.getByText('Paid £6.00', { exact: true })).toBeVisible()
  await expect(page.getByText('Give £4.00 change.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Take payment of £0.00' })).toBeDisabled()
})

test('the Till takes part of the total one way and the rest another', async ({ page }) => {
  await visit(page, '/console/payments/till')
  await page.getByLabel('Programmes sold').fill('2')
  await page.getByLabel('Programmes sold').blur()
  await page.getByRole('button', { name: 'Take payment of £6.00' }).click()
  await page.getByRole('radio', { name: 'Cash' }).first().check()
  await page.getByLabel(/^Amount to take this way/).fill('7')
  await page.getByLabel(/^Amount to take this way/).blur()
  await expect(page.getByText('Enter an amount above nothing and no more than £6.00.')).toBeVisible()
  await page.getByLabel(/^Amount to take this way/).fill('2.50')
  await page.getByLabel(/^Amount to take this way/).blur()
  await page.getByRole('button', { name: 'Cash taken: £2.50' }).click()
  await expect(page.getByText('£2.50 taken. Still to pay: £3.50', { exact: true })).toBeVisible()
  await expect(page.getByText('Paid so far: £2.50')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel sale' })).toHaveCount(0)
  await noViolations(page)
  await page.getByRole('radio', { name: 'Cash' }).first().check()
  await page.getByRole('button', { name: 'Cash taken: £3.50' }).click()
  await expect(page.getByText('Paid £6.00', { exact: true })).toBeVisible()
})
