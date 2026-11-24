// Budgets and claims, part 3: a second approval above a threshold (BC-26, C4), the routes a claim is
// paid by, and paying approved claims through Payments (BC-29 to BC-32): the payment clears claims
// payable and raises what is paid, a full payment marks the claim paid, a reversal undoes it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, changeSettings, createUnit, newId, setClock } from '#kit'
import { setAccessProvider } from '#kit/access'
import { call, env, inContext, person, rows, server, setModule, testAccess } from '../../../../tests/integration/helpers'
import { identityAccess } from '../../../core/server/identity/access'
import { ensureSystemAccounts } from '../../../finance/server/services'
import { ensureVocabularies } from '../../../core/server/vocabularies/service'
import { ensureModuleDefaults } from '../../../core/server/identity/defaults'
import seed from '../../server/listeners/categories'
import budgetsPost from '../../server/api/budgets/budgets/index.post'
import proposePost from '../../server/api/budgets/budgets/[id]/propose.post'
import approveBudget from '../../server/api/budgets/budgets/[id]/approve.post'
import linesPost from '../../server/api/budgets/budgets/[id]/lines.post'
import holdersPost from '../../server/api/budgets/budgets/[id]/holders.post'
import expensesGet from '../../server/api/budgets/expenses.get'
import approvalsGet from '../../server/api/budgets/approvals.get'
import claimsPost from '../../server/api/budgets/claims/index.post'
import claimGet from '../../server/api/budgets/claims/[id].get'
import claimPatch from '../../server/api/budgets/claims/[id].patch'
import itemsPost from '../../server/api/budgets/claims/[id]/items/index.post'
import submitPost from '../../server/api/budgets/claims/[id]/submit.post'
import approvePost from '../../server/api/budgets/claims/[id]/approve.post'
import returnPost from '../../server/api/budgets/claims/[id]/return.post'
import toPayGet from '../../server/api/budgets/to-pay/index.get'
import scheduleGet from '../../server/api/budgets/to-pay/schedule.csv.get'
import disbursementsPost from '../../../payments/server/api/payments/disbursements/index.post'
import payeesGet from '../../../payments/server/api/payments/disbursements/payees.get'
import reversePost from '../../../payments/server/api/payments/disbursements/[id]/reverse.post'
import minePut from '../../../payments/server/api/payments/payees/mine.put'

const handle = server({
  'POST /api/budgets/budgets': budgetsPost,
  'POST /api/budgets/budgets/:id/propose': proposePost,
  'POST /api/budgets/budgets/:id/approve': approveBudget,
  'POST /api/budgets/budgets/:id/lines': linesPost,
  'POST /api/budgets/budgets/:id/holders': holdersPost,
  'GET /api/budgets/expenses': expensesGet,
  'GET /api/budgets/approvals': approvalsGet,
  'POST /api/budgets/claims': claimsPost,
  'GET /api/budgets/claims/:id': claimGet,
  'PATCH /api/budgets/claims/:id': claimPatch,
  'POST /api/budgets/claims/:id/items': itemsPost,
  'POST /api/budgets/claims/:id/submit': submitPost,
  'POST /api/budgets/claims/:id/approve': approvePost,
  'POST /api/budgets/claims/:id/return': returnPost,
  'GET /api/budgets/to-pay': toPayGet,
  'GET /api/budgets/to-pay/schedule.csv': scheduleGet,
  'POST /api/payments/disbursements': disbursementsPost,
  'GET /api/payments/disbursements/payees': payeesGet,
  'POST /api/payments/disbursements/:id/reverse': reversePost,
  'PUT /api/payments/payees/mine': minePut,
})

const NOV_24 = Date.UTC(2026, 10, 24, 12)
const MANAGE = ['budgets.budget.view', 'budgets.budget.manage', 'budgets.budget.approve', 'budgets.budget.hold', 'budgets.category.manage']
const PAY = ['budgets.claim.pay', 'payments.disbursement.record']
type Actor = ReturnType<typeof person>

async function req<T = any>(method: string, path: string, body: unknown, actor: Actor): Promise<{ status: number, body: T, text: string }> {
  const headers = ['POST', 'PUT'].includes(method) ? { 'idempotency-key': newId('req') } : {}
  const response = await call(handle, method, path, { actor, body, headers })
  const text = await response.text()
  let parsed: any = text
  try { parsed = JSON.parse(text) }
  catch { /* a CSV */ }
  return { status: response.status, body: parsed as T, text }
}
async function ok<T = any>(method: string, path: string, body: unknown, actor: Actor): Promise<T> {
  const r = await req<T>(method, path, body, actor)
  expect(r.status, r.text).toBe(200)
  return r.body
}

async function account(name: string, abilities: string[] = []): Promise<Actor> {
  const id = newId('acc')
  await env.DB.prepare("INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, ?, 'invite', ?, ?)").bind(id, name, NOV_24, NOV_24).run()
  if (abilities.length) {
    const roleId = newId('rol')
    await env.DB.prepare("INSERT INTO core_roles (id, key, name, fixed, opens_members_area, needs_managed_identity, expiry_rule, created_at) VALUES (?, ?, 'Test role', 0, 1, 0, 'none', ?)").bind(roleId, `role-${roleId.slice(-10)}`, NOV_24).run()
    for (const a of abilities) await env.DB.prepare('INSERT INTO core_role_abilities (role_id, ability) VALUES (?, ?)').bind(roleId, a).run()
    await env.DB.prepare("INSERT INTO core_grants (id, account_id, role_id, scope, starts_at, granted_by, granted_at) VALUES (?, ?, ?, 'site', ?, 'acc_testgranter', ?)").bind(newId('gra'), id, roleId, NOV_24 - 1000, NOV_24 - 1000).run()
  }
  return person([], { accountId: id, reassertedAt: NOV_24 })
}

async function settings(changes: { key: string, value: unknown }[]) {
  await inContext(async () => {
    const unit = createUnit()
    await changeSettings(unit.view(), changes, { reason: 'test' })
    await unit.commit()
  })
}

let manager: Actor
let treasurer: Actor
let n = 0
async function approvedBudget(): Promise<{ lineId: string, holder: Actor }> {
  const { budgetId } = await ok('POST', '/api/budgets/budgets', { scope: 'general', name: `Paying ${++n}` }, manager)
  const categoryId = (await rows<{ id: string }>("SELECT id FROM budgets_categories WHERE slug = 'set'"))[0]!.id
  const { lineId } = await ok('POST', `/api/budgets/budgets/${budgetId}/lines`, { name: 'Set', kind: 'expense', categoryId, amountMinor: 100_000 }, manager)
  await ok('POST', `/api/budgets/budgets/${budgetId}/propose`, {}, manager)
  await ok('POST', `/api/budgets/budgets/${budgetId}/approve`, {}, treasurer)
  const holder = await account(`Holder ${n}`)
  await ok('POST', `/api/budgets/budgets/${budgetId}/holders`, { accountId: holder.accountId }, manager)
  return { lineId, holder }
}
const member = (extra: string[] = []) => account(`Member ${++n}`, ['budgets.claim.make', ...extra])
const item = (lineId: string, amountMinor: number) => ({ spentOn: '2026-11-20', description: 'Timber', amountMinor, lineId, noReceiptReason: 'Paid in cash' })

async function submitted(claimant: Actor, lineId: string, amountMinor: number, extra: Record<string, unknown> = {}): Promise<{ claimId: string, itemId: string }> {
  const { claimId } = await ok('POST', '/api/budgets/claims', { title: 'Timber for the set', ...extra }, claimant)
  const { itemId } = await ok('POST', `/api/budgets/claims/${claimId}/items`, item(lineId, amountMinor), claimant)
  await ok('POST', `/api/budgets/claims/${claimId}/submit`, { declared: true }, claimant)
  return { claimId, itemId }
}
const version = async (claimId: string, actor: Actor) => (await ok('GET', `/api/budgets/claims/${claimId}`, undefined, actor)).claim.version
const approve = async (claimId: string, actor: Actor, items: { id: string, lineId: string, approvedMinor: number }[]) =>
  req('POST', `/api/budgets/claims/${claimId}/approve`, { version: await version(claimId, actor), items }, actor)
async function approved(claimant: Actor, amountMinor: number, extra: Record<string, unknown> = {}): Promise<string> {
  const { lineId, holder } = await approvedBudget()
  const { claimId, itemId } = await submitted(claimant, lineId, amountMinor, extra)
  const r = await approve(claimId, holder, [{ id: itemId, lineId, approvedMinor: amountMinor }])
  expect(r.status, r.text).toBe(200)
  return claimId
}
const claimRow = async (id: string) => (await rows<{ state: string, paid_minor: number, first_approved_by: string | null }>('SELECT state, paid_minor, first_approved_by FROM budgets_claims WHERE id = ?', id))[0]!
const payable = async () => (await rows<{ n: number }>("SELECT coalesce(sum(e.amount_minor), 0) AS n FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = 'budgets.claims-payable'"))[0]!.n
const pay = (actor: Actor, parts: { record: string, amountMinor: number }[], method = 'bank-transfer') =>
  req('POST', '/api/payments/disbursements', { owner: 'budgets', parts, method, paidOn: '2026-11-24', reference: 'EXP' }, actor)

afterAll(() => setAccessProvider(testAccess))
beforeAll(async () => {
  setAccessProvider({ ...identityAccess, actor: testAccess.actor })
  setClock(NOV_24)
  for (const id of ['finance', 'payments', 'budgets']) await setModule(id, true)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true })
    for (const m of ['budgets', 'payments']) await ensureSystemAccounts(unit.view(), m)
    await seed({ payload: { moduleId: 'budgets' } } as any, unit.view())
    await unit.commit()
    await ensureVocabularies('core')
    await ensureModuleDefaults('budgets', 'acc_testenabler')
  })
  manager = await account('Mo Manager', MANAGE)
  treasurer = await account('Tara Treasurer', [...MANAGE, 'budgets.claim.approve-any'])
})

describe('a second approval above the threshold (BC-26, C4)', () => {
  it('keeps a claim above it submitted after the first approval, until the treasurer, someone else, approves it', async () => {
    await settings([{ key: 'budgets.claims.second-approval-above', value: 1_000 }])
    const { lineId, holder } = await approvedBudget()
    const claimant = await member()
    const { claimId, itemId } = await submitted(claimant, lineId, 1_500)
    expect((await approve(claimId, holder, [{ id: itemId, lineId, approvedMinor: 1_500 }])).body).toMatchObject({ state: 'submitted' })
    expect(await claimRow(claimId)).toMatchObject({ state: 'submitted', first_approved_by: holder.accountId })
    expect((await rows('SELECT 1 FROM finance_postings WHERE source_id = ?', claimId)).length).toBe(0)
    expect((await approve(claimId, holder, [])).body.code).toBe('budgets.claim.second')

    const waiting = await ok('GET', '/api/budgets/approvals', undefined, treasurer)
    expect(waiting.claims.map((c: { id: string }) => c.id)).toContain(claimId)
    expect((await ok('GET', `/api/budgets/claims/${claimId}`, undefined, treasurer)).review).toMatchObject({ awaitingSecond: true, mayApproveSecond: true })
    expect((await approve(claimId, treasurer, [])).body).toMatchObject({ state: 'approved' })
    expect(await claimRow(claimId)).toMatchObject({ state: 'approved' })
    expect((await rows('SELECT 1 FROM finance_postings WHERE source_id = ?', claimId)).length).toBe(1)

    // At or below the threshold, one approval is enough.
    const small = await submitted(claimant, lineId, 1_000)
    expect((await approve(small.claimId, holder, [{ id: small.itemId, lineId, approvedMinor: 1_000 }])).body).toMatchObject({ state: 'approved' })
    await settings([{ key: 'budgets.claims.second-approval-above', value: null }])
  })

  it('never lets the treasurer who approved first give the second, and a claim sent back starts again', async () => {
    await settings([{ key: 'budgets.claims.second-approval-above', value: 1_000 }])
    const { lineId } = await approvedBudget()
    const claimant = await member()
    const { claimId, itemId } = await submitted(claimant, lineId, 2_000)
    expect((await approve(claimId, treasurer, [{ id: itemId, lineId, approvedMinor: 2_000 }])).body).toMatchObject({ state: 'submitted' })
    expect((await approve(claimId, treasurer, [])).body.code).toBe('budgets.claim.second')
    const other = await account('Terry Treasurer', [...MANAGE, 'budgets.claim.approve-any'])
    await ok('POST', `/api/budgets/claims/${claimId}/return`, { version: await version(claimId, other), note: 'Add the receipt' }, other)
    expect(await claimRow(claimId)).toMatchObject({ state: 'returned', first_approved_by: null })
    await settings([{ key: 'budgets.claims.second-approval-above', value: null }])
  })
})

describe('the routes a claim is paid by', () => {
  it('starts a claim on the usual route, lets the claimant choose among those offered, and keeps the usual one offered', async () => {
    const claimant = await member()
    expect((await ok('GET', '/api/budgets/expenses', undefined, claimant)).routes).toEqual({ offered: ['bank-transfer'], preset: 'bank-transfer' })
    const { claimId } = await ok('POST', '/api/budgets/claims', { title: 'Paint' }, claimant)
    expect((await ok('GET', `/api/budgets/claims/${claimId}`, undefined, claimant)).claim.payRoute).toBe('bank-transfer')
    expect((await req('PATCH', `/api/budgets/claims/${claimId}`, { title: 'Paint', payRoute: 'cheque' }, claimant)).body.code).toBe('budgets.claim.route')

    await settings([{ key: 'budgets.claims.routes', value: ['bank-transfer', 'parent-body'] }, { key: 'budgets.claims.default-route', value: 'parent-body' }])
    const next = await ok('POST', '/api/budgets/claims', { title: 'Paint' }, claimant)
    expect((await ok('GET', `/api/budgets/claims/${next.claimId}`, undefined, claimant)).claim.payRoute).toBe('parent-body')
    await ok('PATCH', `/api/budgets/claims/${claimId}`, { title: 'Paint', payRoute: 'parent-body' }, claimant)
    expect((await ok('GET', `/api/budgets/claims/${claimId}`, undefined, claimant)).claim.payRoute).toBe('parent-body')

    await expect(settings([{ key: 'budgets.claims.routes', value: ['bank-transfer'] }])).rejects.toMatchObject({ code: 'core.setting.rule-failed' })
    await expect(settings([{ key: 'budgets.claims.routes', value: [] }])).rejects.toMatchObject({ code: 'core.setting.rule-failed', reason: 'budgets.settings.rules.routes-needed' })
    await settings([{ key: 'budgets.claims.default-route', value: 'bank-transfer' }, { key: 'budgets.claims.routes', value: ['bank-transfer'] }])
  })
})

describe('paying approved claims (BC-29 to BC-32)', () => {
  it('lists approved claims to pay, not the payer\'s own, with whether bank details are on file', async () => {
    const payer = await member(PAY)
    const claimant = await member()
    const theirs = await approved(claimant, 2_500)
    const own = await approved(payer, 700)
    const list = await ok('GET', '/api/budgets/to-pay', undefined, payer)
    const ids = list.claims.map((c: { id: string }) => c.id)
    expect(ids).toContain(theirs)
    expect(ids).not.toContain(own)
    expect(list.claims.find((c: { id: string }) => c.id === theirs)).toMatchObject({ claimant: expect.stringMatching(/^Member/), payRoute: 'bank-transfer', owedMinor: 2_500 })
    expect((await req('GET', '/api/budgets/to-pay', undefined, claimant)).status).toBe(403)

    const before = await ok('GET', `/api/payments/disbursements/payees?owner=budgets&records=${theirs}`, undefined, payer)
    expect(before.payees[theirs]).toBeNull()
    await ok('PUT', '/api/payments/payees/mine', { accountName: 'M Member', sortCode: '12-34-56', accountNumber: '12345678' }, claimant)
    const after = await ok('GET', `/api/payments/disbursements/payees?owner=budgets&records=${theirs}`, undefined, payer)
    expect(after.payees[theirs]).toEqual({ held: true, initial: 'M', lastDigits: '78' })
  })

  it('raises what is paid with each payment, marks the claim paid when it is all paid and tells the claimant, and a reversal undoes it', async () => {
    const payer = await member(PAY)
    const claimant = await member()
    const claimId = await approved(claimant, 2_000)
    const owing = await payable()

    expect((await pay(payer, [{ record: claimId, amountMinor: 2_500 }])).body.code).toBe('budgets.claim.overpaid')
    const first = await ok('POST', '/api/payments/disbursements', { owner: 'budgets', parts: [{ record: claimId, amountMinor: 1_500 }], method: 'bank-transfer', paidOn: '2026-11-24' }, payer)
    expect(await claimRow(claimId)).toMatchObject({ state: 'approved', paid_minor: 1_500 })
    expect(await payable()).toBe(owing + 1_500)
    await ok('POST', '/api/payments/disbursements', { owner: 'budgets', parts: [{ record: claimId, amountMinor: 500 }], method: 'bank-transfer', paidOn: '2026-11-24' }, payer)
    expect(await claimRow(claimId)).toMatchObject({ state: 'paid', paid_minor: 2_000 })
    const told = await rows<{ account_id: string }>("SELECT account_id FROM core_notifications WHERE type_key = 'budgets.claim-decided' AND account_id = ?", claimant.accountId)
    expect(told.length).toBeGreaterThanOrEqual(2)
    const events = await rows<{ action: string, disbursement_id: string | null }>("SELECT action, disbursement_id FROM budgets_claim_events WHERE claim_id = ? AND action = 'paid' ORDER BY at, id", claimId)
    expect(events).toEqual([{ action: 'paid', disbursement_id: first.disbursementIds[0] }, { action: 'paid', disbursement_id: expect.any(String) }])

    await ok('POST', `/api/payments/disbursements/${first.disbursementIds[0]}/reverse`, {}, payer)
    expect(await claimRow(claimId)).toMatchObject({ state: 'approved', paid_minor: 500 })
    expect((await rows<{ action: string }>("SELECT action FROM budgets_claim_events WHERE claim_id = ? AND action = 'payment-reversed'", claimId)).length).toBe(1)
  })

  it('refuses a payment of one\'s own claim, and from someone who records payments but does not pay claims', async () => {
    const payer = await member(PAY)
    const own = await approved(payer, 900)
    expect((await pay(payer, [{ record: own, amountMinor: 900 }])).body.code).toBe('budgets.claim.own')
    const recorder = await member(['payments.disbursement.record'])
    const theirs = await approved(await member(), 900)
    expect((await pay(recorder, [{ record: theirs, amountMinor: 900 }])).body.code).toBe('budgets.claim.not-payer')
    expect(await claimRow(theirs)).toMatchObject({ state: 'approved', paid_minor: 0 })
  })

  it('pays several of one person\'s claims in one payment, and downloads the parent body\'s schedule of what it pays', async () => {
    await settings([{ key: 'budgets.claims.routes', value: ['bank-transfer', 'parent-body'] }])
    const payer = await member(PAY)
    const claimant = await member()
    const a = await approved(claimant, 1_200, { payRoute: 'parent-body' })
    const b = await approved(claimant, 300, { payRoute: 'parent-body' })

    const csv = await req('GET', '/api/budgets/to-pay/schedule.csv', undefined, payer)
    expect(csv.status).toBe(200)
    const lines = csv.text.trim().split('\r\n')
    expect(lines[0]).toBe('Claim,Claimant,Approved,Category,Nominal code,Amount,Receipts')
    expect(lines.some(l => l.includes(',12.00,'))).toBe(true)
    expect(lines.some(l => l.includes(',3.00,'))).toBe(true)
    expect((await rows("SELECT 1 FROM core_audit WHERE action = 'read' AND ability = 'budgets.claim.pay'")).length).toBeGreaterThan(0)

    await ok('POST', '/api/payments/disbursements', { owner: 'budgets', parts: [{ record: a, amountMinor: 1_200 }, { record: b, amountMinor: 300 }], method: 'parent-body', paidOn: '2026-11-24' }, payer)
    expect((await claimRow(a)).state).toBe('paid')
    expect((await claimRow(b)).state).toBe('paid')
    const after = await req('GET', '/api/budgets/to-pay/schedule.csv', undefined, payer)
    expect(after.text.trim().split('\r\n')).toHaveLength(1)
    await settings([{ key: 'budgets.claims.routes', value: ['bank-transfer'] }])
  })
})
