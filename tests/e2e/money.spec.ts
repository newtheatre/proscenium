// The money screens in a real browser: Payments' and Finance's console pages load for someone who
// holds their abilities, have no accessibility violations, and the till opens a till session by itself.
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
  const owner = { kind: 'person', accountId: 'acc_moneyowner', name: 'Money Owner', assurance: 'strong', reassertedAt: Date.now(), grants: [grant('core.settings.manage'), grant('core.modules.manage'), grant('payments.settings.manage')] }
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(owner) })
  await api.put('/api/core/settings', { data: { changes: [{ key: 'core.rate-limits.default', value: 10000 }] } })
  // The till posts a sale to the ledger, which dates it in the theatre's time zone.
  expect((await api.put('/api/core/settings', { data: { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }], confirm: true } })).ok()).toBe(true)
  for (const id of ['finance', 'payments']) expect((await api.put(`/api/core/modules/${id}`, { data: { on: true } })).ok()).toBe(true)
  // The till tests take cash, which a theatre has by adding a cash account; the last test takes them out of use.
  expect((await api.post('/api/payments/providers', { data: { provider: 'cash', label: 'Cash', channels: ['desk'], mode: 'live' }, headers: { 'idempotency-key': crypto.randomUUID() } })).ok()).toBe(true)
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
  // A receipt asked for after paying.
  await page.getByLabel('Email a receipt').click()
  await page.getByPlaceholder('Name or email address').fill('after@example.com')
  await page.getByRole('option', { name: 'Use after@example.com' }).click()
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByText('Receipt sent, with any tickets.')).toBeVisible()
  await page.getByRole('button', { name: 'Next customer' }).click()
  await expect(page.getByText('Nothing added yet.')).toBeVisible()
  // The sale opened the session, shown as Your session above Till sessions with the cash expected.
  await expect(page.getByText(/^Your session since/)).toBeVisible()
  await visit(page, '/console/payments/sessions')
  await expect(page.getByRole('heading', { name: 'Your session' })).toBeVisible()
  await expect(page.getByText('Cash expected now')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close and count' })).toBeEnabled()
  await noViolations(page)
})

/** A person's way to pay in a split sale. */
const personCash = (page: Page, n: number) => page.getByRole('group', { name: `How person ${n} is paying` }).getByRole('button', { name: /^Cash/ }).first()

test('the Till splits a sale by item, and each person pays for their own with their own receipt', async ({ page }) => {
  await visit(page, '/live/till')
  await page.getByLabel('Programmes sold').fill('2')
  await page.getByLabel('Programmes sold').blur()
  await page.getByRole('button', { name: 'Split' }).click()
  // Each item is given to a person; nobody types an amount.
  await expect(page.getByText('Split by item')).toBeVisible()
  await expect(page.getByLabel('Amount to take this way')).toHaveCount(0)
  await expect(page.getByRole('radiogroup', { name: 'Who pays for Programme' })).toHaveCount(2)
  await noViolations(page)
  // Person 2's receipt, to an address typed into their receipt box.
  await page.getByLabel('Email a receipt to').nth(1).click()
  await page.getByPlaceholder('Name or email address').fill('pat@example.com')
  await page.getByRole('option', { name: 'Use pat@example.com' }).click()
  await personCash(page, 2).click()
  await expect(page.getByText('Person 2 pays £3.00')).toBeVisible()
  await page.getByRole('button', { name: 'Cash taken: £3.00' }).click()
  await expect(page.getByText('£3.00 taken. Still to pay: £3.00', { exact: true })).toBeVisible()
  await expect(page.getByText('Paid so far: £3.00')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel sale' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'How person 2 is paying' })).toHaveCount(0)
  await noViolations(page)
  await personCash(page, 1).click()
  await page.getByRole('button', { name: 'Cash taken: £3.00' }).click()
  await expect(page.getByText('Paid £6.00', { exact: true })).toBeVisible()
})

test('Split is off for a single item, gives every item to someone, and a reload keeps who pays for what', async ({ page }) => {
  await visit(page, '/live/till')
  await page.getByLabel('Programmes sold').fill('1')
  await page.getByLabel('Programmes sold').blur()
  await expect(payButton(page, '£3.00')).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Split' })).toBeDisabled()
  await page.getByLabel('Programmes sold').fill('2')
  await page.getByLabel('Programmes sold').blur()
  await page.getByRole('button', { name: 'Split' }).click()
  // Both programmes to person 1 leaves person 2 nothing to pay for.
  await page.getByRole('radiogroup', { name: 'Who pays for Programme' }).nth(1).getByRole('radio', { name: 'Person 1' }).click()
  await expect(page.getByText('Nothing given to this person yet.')).toBeVisible()
  await expect(personCash(page, 1)).toBeDisabled()
  await page.getByRole('radiogroup', { name: 'Who pays for Programme' }).nth(1).getByRole('radio', { name: 'Person 2' }).click()
  // Nothing is started until someone pays.
  await expect(page.getByRole('button', { name: 'Cancel sale' })).toHaveCount(0)
  await personCash(page, 1).click()
  await expect(page.getByText('Still to pay: £6.00')).toBeVisible()
  // Reloaded before anyone has paid: the people and what each pays for come back from the sale.
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  await expect(page.getByText('A payment of £6.00 was not finished').first()).toBeVisible()
  await expect(page.getByText('Programmes × 2')).toBeVisible()
  await personCash(page, 1).click()
  await page.getByRole('button', { name: 'Cash taken: £3.00' }).click()
  await expect(page.getByText('Paid so far: £3.00')).toBeVisible()
  await personCash(page, 2).click()
  await page.getByRole('button', { name: 'Cash taken: £3.00' }).click()
  await expect(page.getByText('Paid £6.00', { exact: true })).toBeVisible()
  // The note about the unfinished payment goes once it is paid.
  await expect(page.getByText('A payment of £6.00 was not finished')).toHaveCount(0)
})

test('cancelling a sale empties the basket unless the seller unticks the box', async ({ page }) => {
  await visit(page, '/live/till')
  const programmes = page.getByLabel('Programmes sold')
  for (const empty of [false, true]) {
    await programmes.fill('2')
    await programmes.blur()
    await cash(page).click()
    await page.getByRole('button', { name: 'Cancel sale' }).click()
    const dialog = page.getByRole('dialog')
    const box = dialog.getByRole('checkbox', { name: 'Empty the basket' })
    await expect(box).toBeChecked()
    if (!empty) await box.uncheck()
    await dialog.getByRole('button', { name: 'Cancel sale' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(programmes).toHaveValue(empty ? '' : '2')
  }
})

test('the Till gives back what was taken when the customer leaves a sale paid in part', async ({ page }) => {
  await visit(page, '/live/till')
  await page.getByLabel('Programmes sold').fill('2')
  await page.getByLabel('Programmes sold').blur()
  await page.getByRole('button', { name: 'Split' }).click()
  await personCash(page, 1).click()
  await page.getByRole('button', { name: 'Cash taken: £3.00' }).click()
  await expect(page.getByText('Paid so far: £3.00')).toBeVisible()
  await page.getByRole('button', { name: 'Give back what was taken' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Give back what was taken' }).click()
  await expect(page.getByText('Sale ended and payment given back', { exact: true })).toBeVisible()
  await expect(page.getByText('£3.00 handed back.', { exact: true })).toBeVisible()
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
  // Every account is a small card of one size; its keys open in a slide-over from Manage.
  await page.getByRole('button', { name: `Manage ${label}` }).click()
  const card = page.getByRole('dialog', { name: label })
  await expect(card.getByText('Missing Secret key, Webhook signing secret, Publishable key')).toBeVisible()
  // Keys are managed in the app, on the same Keys card as every other page: nothing sends people to Worker secrets.
  await expect(page.getByText(/on the site's Worker/)).toHaveCount(0)
  await expect(card.getByRole('heading', { level: 2, name: 'Keys', exact: true })).toBeVisible()
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
  await page.getByRole('button', { name: 'Remove key' }).click()
  await expect(page.getByText('Key removed', { exact: true }).first()).toBeVisible()
  await expect(card.getByText('Missing Secret key')).toBeVisible()
})

test('without cash, a seller\'s session has no float and closes in one step from Your session', async ({ page, playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(treasurer) })
  // Back to the default, no cash account in use, which later files expect too.
  const { accounts } = await (await api.get('/api/payments/providers')).json() as { accounts: { id: string, provider: string, active: boolean }[] }
  for (const a of accounts.filter(a => a.provider === 'cash' && a.active)) expect((await api.patch(`/api/payments/providers/${a.id}`, { data: { active: false } })).ok()).toBe(true)
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
