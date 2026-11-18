// The money screens in a real browser: Payments' and Finance's console pages load for someone who
// holds their abilities, have no accessibility violations, and the till opens a till session by itself.
import { test, expect, type Locator, type Page } from '@playwright/test'
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
  const owner = { kind: 'person', accountId: 'acc_moneyowner', name: 'Money Owner', assurance: 'strong', reassertedAt: Date.now(), grants: [grant('core.settings.manage'), grant('core.modules.manage'), grant('payments.settings.manage')] }
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(owner) })
  await api.put('/api/core/settings', { data: { changes: [{ key: 'core.rate-limits.default', value: 10000 }] } })
  // The till posts a sale to the ledger, which dates it in the theatre's time zone.
  expect((await api.put('/api/core/settings', { data: { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }], confirm: true } })).ok()).toBe(true)
  for (const id of ['finance', 'payments']) expect((await api.put(`/api/core/modules/${id}`, { data: { on: true } })).ok()).toBe(true)
  // The till tests take cash, which a theatre turns on; the last test turns it off again.
  expect((await api.put('/api/core/settings', { data: { changes: [{ key: 'payments.cash.enabled', value: true }], confirm: true } })).ok()).toBe(true)
  await api.dispose()
})
test.use(as(treasurer))

async function visit(page: Page, url: string) {
  const response = await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  return response
}

/** The receipt's first way to pay, which carries the total. */
const payButton = (page: Page, amount: string) => page.getByRole('button', { name: new RegExp(` · ${amount.replace('.', '\\.')}$`) })
/** Paying by cash from the receipt: one press makes the sale and asks for the cash. Other browser tests may have added a cash drawer too. */
const cash = (page: Page) => page.getByRole('button', { name: /^Cash( ·|$)/ }).first()

async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

const SCREENS = [
  ['/console/payments/sessions', 'Till sessions'],
  ['/console/payments/attention', 'Needs attention'],
  ['/console/payments/refunds', 'Refunds'],
  ['/console/finance/ledger', 'Ledger'],
  ['/console/finance/periods', 'Periods'],
  ['/console/finance/productions', 'Production statements'],
  ['/console/finance/reconcile', 'Reconciliation'],
  ['/console/finance/export', 'Export'],
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

for (const [path, module, title] of [['/admin/modules/payments/providers', 'Payments', 'Providers and readers'], ['/admin/modules/finance/accounts', 'Finance', 'Ledger accounts']] as const) {
  test(`${title}, a set-up screen, opens for console staff in the console's settings window and has no violations`, async ({ browser }) => {
    // Someone who may set up payments and the ledger but has no business in Admin.
    const context = await browser.newContext(as({ ...treasurer, accountId: 'acc_setupstaff', name: 'Sid Setup', grants: ['payments.provider.manage', 'finance.account.manage', 'finance.ledger.view'].map(grant) }))
    const page = await context.newPage()
    await visit(page, path)
    await expect(page).toHaveURL(/\/console\?settings=/)
    const window = page.getByRole('dialog')
    await expect(window.getByRole('heading', { name: `${module} settings` })).toBeVisible()
    await expect(window.getByRole('heading', { level: 2, name: title })).toBeVisible()
    await noViolations(page)
    await context.close()
  })
}

for (const [path, title] of [['/console/payments/sessions', 'Payments settings'], ['/console/finance/ledger', 'Finance settings']] as const) {
  test(`${title} open from the cog on ${path} and have no violations`, async ({ page }) => {
    await visit(page, path)
    await page.getByRole('link', { name: title }).click()
    await expect(page.getByRole('dialog').getByRole('heading', { name: title })).toBeVisible()
    await noViolations(page)
  })
}

test('the till is a live screen: a tile on Tonight and a button on Till sessions, not a menu entry', async ({ page }) => {
  await visit(page, '/console/payments/sessions')
  await expect(page.getByRole('link', { name: 'Open the till' })).toHaveAttribute('href', '/live/till')
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Open the till' })).toHaveCount(0)
  await visit(page, '/live')
  await page.getByRole('link', { name: 'Till' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Till' })).toBeVisible()
  await noViolations(page)
})

test('coming to the till opens no session: it waits for the first sale', async ({ page }) => {
  const looker = { ...treasurer, accountId: 'acc_tilllooker', name: 'Lou Looker', grants: ['payments.session.open', 'gallery.sample.view'].map(grant) }
  await page.context().setExtraHTTPHeaders(as(looker).extraHTTPHeaders)
  await visit(page, '/live/till')
  await expect(page.getByText('Your session opens with your first sale, at')).toBeVisible()
  await expect(page.getByLabel('Place: Unknown')).toBeVisible()
  await noViolations(page)
  await visit(page, '/console/payments/sessions')
  await expect(page.getByRole('heading', { name: 'Your session' })).toBeVisible()
  await expect(page.getByText('You have no session open. The till opens one with your first sale.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'My session' })).toHaveCount(0)
})

test('the Till sells from a panel and takes cash for the total', async ({ page, playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(treasurer) })
  const key = () => ({ 'idempotency-key': crypto.randomUUID() })
  expect((await api.post('/api/payments/providers', { data: { provider: 'cash', label: 'Cash drawer', channels: ['desk'], mode: 'live' }, headers: key() })).ok()).toBe(true)
  await api.dispose()

  await visit(page, '/live/till')
  await expect(page.getByRole('heading', { name: 'Gallery programmes' })).toBeVisible()
  await page.getByLabel('Programmes sold').fill('2')
  await page.getByLabel('Programmes sold').blur()
  await expect(payButton(page, '£6.00')).toBeEnabled()
  await noViolations(page)
  await cash(page).click()
  await expect(page.getByText('Still to pay: £6.00')).toBeVisible()
  await page.getByLabel(/^Cash handed over/).fill('10')
  await page.getByLabel(/^Cash handed over/).blur()
  // The change shows while the cash is typed, before the sale is done.
  await expect(page.getByText('Change: £4.00')).toBeVisible()
  await noViolations(page)
  await page.getByRole('button', { name: 'Cash taken' }).click()
  await expect(page.getByText('Paid £6.00', { exact: true })).toBeVisible()
  await expect(page.getByText('Give £4.00 change.', { exact: true })).toBeVisible()
  // The change stays on the receipt until the next sale starts.
  await expect(page.getByRole('status').filter({ hasText: 'Change to give' })).toContainText('£4.00')
  await expect(page.getByText('Nothing added yet.')).toBeVisible()
  // The sale opened the session, shown as Your session above Till sessions with the cash expected.
  await expect(page.getByText(/^Your session since/)).toBeVisible()
  await visit(page, '/console/payments/sessions')
  await expect(page.getByRole('heading', { name: 'Your session' })).toBeVisible()
  await expect(page.getByText('Cash expected now')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close and count' })).toBeEnabled()
  await noViolations(page)
})

/** Types an amount into a currency number field, leaves it, and waits for it to show the amount. */
async function amount(field: Locator, typed: string) {
  await field.click()
  await field.press('ControlOrMeta+a')
  await field.pressSequentially(typed)
  await field.press('Tab')
  await expect(field).toHaveValue(`£${Number(typed).toFixed(2)}`)
}

test('the Till takes part of the total one way and the rest another', async ({ page }) => {
  await visit(page, '/live/till')
  await page.getByLabel('Programmes sold').fill('2')
  await page.getByLabel('Programmes sold').blur()
  await page.getByRole('button', { name: 'Split' }).click()
  // Typed as a seller types it, over the whole of what is there. Playwright's fill() sets the text in
  // one go, which the number field's own input checks sometimes refuse once it holds a formatted
  // amount, leaving the old one in place.
  const part = page.getByLabel(/^Amount to take this way/)
  await amount(part, '7')
  await expect(page.getByText('Enter an amount above nothing and no more than £6.00.')).toBeVisible()
  await amount(part, '2.50')
  await cash(page).click()
  await page.getByRole('button', { name: 'Cash taken: £2.50' }).click()
  await expect(page.getByText('£2.50 taken. Still to pay: £3.50', { exact: true })).toBeVisible()
  await expect(page.getByText('Paid so far: £2.50')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel sale' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Give back what was taken' })).toBeVisible()
  await noViolations(page)
  await cash(page).click()
  await page.getByRole('button', { name: 'Cash taken: £3.50' }).click()
  await expect(page.getByText('Paid £6.00', { exact: true })).toBeVisible()
})

test('Split asks for the first amount before starting the sale, and a reload keeps the split and its lines', async ({ page }) => {
  await visit(page, '/live/till')
  await page.getByLabel('Programmes sold').fill('2')
  await page.getByLabel('Programmes sold').blur()
  await page.getByRole('button', { name: 'Split' }).click()
  // Nothing is started yet: the way back leaves the sale as it was.
  await expect(page.getByRole('button', { name: 'Cancel sale' })).toHaveCount(0)
  await expect(cash(page)).toBeDisabled() // a split needs its first amount
  await amount(page.getByLabel(/^Amount to take this way/), '2')
  await cash(page).click()
  await expect(page.getByText('Still to pay: £6.00')).toBeVisible()
  // Reloaded before the first part is taken: the split and what the sale is for are still there.
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  await expect(page.getByText('A payment of £6.00 was not finished').first()).toBeVisible()
  await expect(page.getByText('Programmes × 2')).toBeVisible()
  await expect(page.getByLabel(/^Amount to take this way/)).toHaveValue('£2.00')
  await cash(page).click()
  await page.getByRole('button', { name: 'Cash taken: £2.00' }).click()
  await expect(page.getByText('Paid so far: £2.00')).toBeVisible()
  await cash(page).click()
  await page.getByRole('button', { name: 'Cash taken: £4.00' }).click()
  await expect(page.getByText('Paid £6.00', { exact: true })).toBeVisible()
  // The note about the unfinished payment goes once it is paid.
  await expect(page.getByText('A payment of £6.00 was not finished')).toHaveCount(0)
})

test('the Till gives back what was taken when the customer leaves a sale paid in part', async ({ page }) => {
  await visit(page, '/live/till')
  await page.getByLabel('Programmes sold').fill('1')
  await page.getByLabel('Programmes sold').blur()
  await page.getByRole('button', { name: 'Split' }).click()
  await amount(page.getByLabel(/^Amount to take this way/), '2')
  await cash(page).click()
  await page.getByRole('button', { name: 'Cash taken: £2.00' }).click()
  await expect(page.getByText('Paid so far: £2.00')).toBeVisible()
  await page.getByRole('button', { name: 'Give back what was taken' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Give back what was taken' }).click()
  await expect(page.getByText('Sale ended and payment given back', { exact: true })).toBeVisible()
  await expect(page.getByText('£2.00 handed back.', { exact: true })).toBeVisible()
  await expect(page.getByText('Nothing added yet.')).toBeVisible()
})

test('the Till picks a sale up again when the SumUp app sends the seller back', async ({ page, playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(treasurer) })
  const made = await api.post('/api/payments/till/sale', { data: { panels: [{ basket: 'gallery', input: { count: 1 } }] }, headers: { 'idempotency-key': crypto.randomUUID() } })
  expect(made.ok()).toBe(true)
  const { intentId } = await made.json() as { intentId: string }

  await visit(page, `/live/till?attempt=att_none&intent=${intentId}&result=failed`)
  await expect(page.getByText('Still to pay: £3.00')).toBeVisible()
  await expect(page.getByText('The payment did not go through')).toBeVisible()
  await expect(page).toHaveURL(/\/live\/till$/)
  await noViolations(page)
  expect((await api.post(`/api/payments/intents/${intentId}/cancel`, { data: {} })).ok()).toBe(true)
  await api.dispose()
})

test('Till sessions lists the sessions opened above, newest first, and filters them by state', async ({ page }) => {
  await visit(page, '/console/payments/sessions')
  // The till opened the treasurer's session at no place; other browser tests open more.
  await expect(page.getByRole('cell', { name: /^Unknown/ }).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Open', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('searchbox')).toBeVisible()
  await visit(page, '/console/payments/sessions?view=counting')
  await expect(page.getByRole('cell', { name: 'Open', exact: true })).toHaveCount(0)
  await noViolations(page)
})

test('the Ledger lists the sale with its entries open, and the Refunds view leaves it out', async ({ page }) => {
  await visit(page, '/console/finance/ledger')
  await expect(page.getByRole('cell', { name: 'Sale' }).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: '£6.00' }).first()).toBeVisible()
  await noViolations(page)
  await visit(page, '/console/finance/ledger?view=refunds')
  await expect(page.getByRole('cell', { name: 'Sale' })).toHaveCount(0)
})

test('Providers takes a Stripe account\'s keys, shows only their last four characters, and removes one', async ({ page, playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(treasurer) })
  const label = `Stripe keys ${Date.now()}`
  expect((await api.post('/api/payments/providers', { data: { provider: 'stripe', label, channels: ['online'], mode: 'test' }, headers: { 'idempotency-key': crypto.randomUUID() } })).ok()).toBe(true)
  await api.dispose()
  await visit(page, '/admin/modules/payments/providers')
  const card = page.locator('div').filter({ has: page.getByText(label, { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Save keys' }) }).last()
  await expect(card.getByText('Missing Secret key, Webhook signing secret, Publishable key')).toBeVisible()
  await card.getByLabel('Secret key').fill('sk_test_e2eabcdefghijklm1234')
  await card.getByLabel('Webhook signing secret').fill('whsec_e2eabcdefghijklm5678')
  await card.getByLabel('Publishable key').fill('pk_test_e2eabcdefghijklm9012')
  await card.getByRole('button', { name: 'Save keys' }).click()
  await expect(page.getByText('Keys saved', { exact: true }).first()).toBeVisible()
  // A saved key fills its field with dots between its prefix and its last four characters.
  await expect(card.getByLabel('Secret key')).toHaveValue('sk_test_••••••••••••1234')
  await expect(card.getByText('Missing', { exact: false })).toHaveCount(0)
  await noViolations(page)
  await card.getByRole('button', { name: 'Remove' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove key' }).click()
  await expect(page.getByText('Key removed', { exact: true }).first()).toBeVisible()
  await expect(card.getByText('Missing Secret key')).toBeVisible()
})

test('without cash, a seller\'s session has no float and closes in one step from Your session', async ({ page, playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(treasurer) })
  // Back to the default, which later files expect too.
  expect((await api.put('/api/core/settings', { data: { changes: [{ key: 'payments.cash.enabled', value: false }], confirm: true } })).ok()).toBe(true)
  await api.dispose()
  // A seller who may not see everyone's sessions sees only their own on Sessions.
  const seller = { ...treasurer, accountId: 'acc_nocashseller', name: 'Nora No-Cash', grants: ['payments.session.open', 'gallery.sample.view'].map(grant) }
  await page.context().setExtraHTTPHeaders(as(seller).extraHTTPHeaders)
  // The first sale would open it; this seller has no way to take payment, so it is opened directly.
  const own = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(seller) })
  expect((await own.post('/api/payments/till/session', { data: {} })).ok()).toBe(true)
  await own.dispose()
  await visit(page, '/live/till')
  await expect(page.getByText(/^Your session since/)).toBeVisible()
  await visit(page, '/console/payments/sessions')
  await expect(page.getByRole('heading', { name: 'Your session' })).toBeVisible()
  await expect(page.getByRole('searchbox')).toHaveCount(0)
  await expect(page.getByText('Cash expected now')).toHaveCount(0)
  await expect(page.getByText('Closes itself at about')).toBeVisible()
  await noViolations(page)
  await page.getByRole('button', { name: 'Close session' }).click()
  await expect(page.getByText('Session closed', { exact: true })).toBeVisible()
  await expect(page.getByText('You have no session open. The till opens one with your first sale.')).toBeVisible()
})
