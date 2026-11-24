// Budgets and claims, part 3: expense claims (BC-19 to BC-25, BC-27, BC-28). A member makes a claim
// with an item per purchase and a receipt or a reason for each, and submits it; holders of the lines it
// touches approve it, the treasurer over budget, never the claimant; approval posts the expense, a void
// reverses it, and a claim fulfils the request it names.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { setAccessProvider } from '#kit/access'
import { call, env, inContext, person, rows, server, setModule, testAccess } from '../../../../tests/integration/helpers'
import { identityAccess } from '../../../core/server/identity/access'
import { eraseAccount, erasureHolds } from '../../../core/server/identity/erasure'
import { ensureSystemAccounts } from '../../../finance/server/services'
import { ensureVocabularies } from '../../../core/server/vocabularies/service'
import { ensureModuleDefaults } from '../../../core/server/identity/defaults'
import seed from '../../server/listeners/categories'
import budgetsPost from '../../server/api/budgets/budgets/index.post'
import budgetGet from '../../server/api/budgets/budgets/[id].get'
import proposePost from '../../server/api/budgets/budgets/[id]/propose.post'
import approveBudget from '../../server/api/budgets/budgets/[id]/approve.post'
import closePost from '../../server/api/budgets/budgets/[id]/close.post'
import linesPost from '../../server/api/budgets/budgets/[id]/lines.post'
import holdersPost from '../../server/api/budgets/budgets/[id]/holders.post'
import requestsPost from '../../server/api/budgets/requests/index.post'
import requestApprove from '../../server/api/budgets/requests/[id]/approve.post'
import expensesGet from '../../server/api/budgets/expenses.get'
import approvalsGet from '../../server/api/budgets/approvals.get'
import claimsPost from '../../server/api/budgets/claims/index.post'
import claimGet from '../../server/api/budgets/claims/[id].get'
import claimPatch from '../../server/api/budgets/claims/[id].patch'
import itemsPost from '../../server/api/budgets/claims/[id]/items/index.post'
import itemPatch from '../../server/api/budgets/claims/[id]/items/[itemId].patch'
import itemDelete from '../../server/api/budgets/claims/[id]/items/[itemId].delete'
import receiptsPost from '../../server/api/budgets/claims/[id]/items/[itemId]/receipts/index.post'
import submitPost from '../../server/api/budgets/claims/[id]/submit.post'
import withdrawPost from '../../server/api/budgets/claims/[id]/withdraw.post'
import approvePost from '../../server/api/budgets/claims/[id]/approve.post'
import returnPost from '../../server/api/budgets/claims/[id]/return.post'
import declinePost from '../../server/api/budgets/claims/[id]/decline.post'
import voidPost from '../../server/api/budgets/claims/[id]/void.post'

const handle = server({
  'POST /api/budgets/budgets': budgetsPost,
  'GET /api/budgets/budgets/:id': budgetGet,
  'POST /api/budgets/budgets/:id/propose': proposePost,
  'POST /api/budgets/budgets/:id/approve': approveBudget,
  'POST /api/budgets/budgets/:id/close': closePost,
  'POST /api/budgets/budgets/:id/lines': linesPost,
  'POST /api/budgets/budgets/:id/holders': holdersPost,
  'POST /api/budgets/requests': requestsPost,
  'POST /api/budgets/requests/:id/approve': requestApprove,
  'GET /api/budgets/expenses': expensesGet,
  'GET /api/budgets/approvals': approvalsGet,
  'POST /api/budgets/claims': claimsPost,
  'GET /api/budgets/claims/:id': claimGet,
  'PATCH /api/budgets/claims/:id': claimPatch,
  'POST /api/budgets/claims/:id/items': itemsPost,
  'PATCH /api/budgets/claims/:id/items/:itemId': itemPatch,
  'DELETE /api/budgets/claims/:id/items/:itemId': itemDelete,
  'POST /api/budgets/claims/:id/items/:itemId/receipts': receiptsPost,
  'POST /api/budgets/claims/:id/submit': submitPost,
  'POST /api/budgets/claims/:id/withdraw': withdrawPost,
  'POST /api/budgets/claims/:id/approve': approvePost,
  'POST /api/budgets/claims/:id/return': returnPost,
  'POST /api/budgets/claims/:id/decline': declinePost,
  'POST /api/budgets/claims/:id/void': voidPost,
})

const NOV_24 = Date.UTC(2026, 10, 24, 12)
const MANAGE = ['budgets.budget.view', 'budgets.budget.manage', 'budgets.budget.approve', 'budgets.budget.hold', 'budgets.category.manage']
const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF')
type Actor = ReturnType<typeof person>

async function req<T = any>(method: string, path: string, body: unknown, actor: Actor): Promise<{ status: number, body: T }> {
  const headers = method === 'POST' ? { 'idempotency-key': newId('req') } : {}
  const response = await call(handle, method, path, { actor, body, headers })
  return { status: response.status, body: await response.json() as T }
}
async function ok<T = any>(method: string, path: string, body: unknown, actor: Actor): Promise<T> {
  const r = await req<T>(method, path, body, actor)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body
}
async function upload(claimId: string, itemId: string, actor: Actor) {
  const headers: Record<string, string> = { 'content-type': 'application/octet-stream', 'host': 'test', 'x-test-actor': JSON.stringify(actor) }
  const response = await handle(new Request(`http://test/api/budgets/claims/${claimId}/items/${itemId}/receipts?name=receipt.pdf`, { method: 'POST', headers, body: PDF }))
  return { status: response.status, body: await response.json() as any }
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

let manager: Actor
let treasurer: Actor
let n = 0
/** An approved general budget with one expense line of £100, and a holder for it. */
async function approvedBudget(holder?: Actor): Promise<{ budgetId: string, lineId: string, holder: Actor }> {
  const { budgetId } = await ok('POST', '/api/budgets/budgets', { scope: 'general', name: `Budget ${++n}` }, manager)
  const categoryId = (await rows<{ id: string }>("SELECT id FROM budgets_categories WHERE slug = 'set'"))[0]!.id
  const { lineId } = await ok('POST', `/api/budgets/budgets/${budgetId}/lines`, { name: 'Set', kind: 'expense', categoryId, amountMinor: 10_000 }, manager)
  await ok('POST', `/api/budgets/budgets/${budgetId}/propose`, {}, manager)
  await ok('POST', `/api/budgets/budgets/${budgetId}/approve`, {}, treasurer)
  const who = holder ?? await account(`Holder ${n}`)
  await ok('POST', `/api/budgets/budgets/${budgetId}/holders`, { accountId: who.accountId }, manager)
  return { budgetId, lineId, holder: who }
}
const member = () => account(`Member ${++n}`, ['budgets.claim.make', 'budgets.request.make'])
const item = (lineId: string, amountMinor: number, extra: Record<string, unknown> = {}) => ({ spentOn: '2026-11-20', description: 'Gaffer tape, 3 rolls', supplier: 'Hardware shop', amountMinor, lineId, noReceiptReason: 'Lost on the bus', ...extra })

/** A claim with these items, submitted unless told not to. */
async function claimWith(claimant: Actor, items: Record<string, unknown>[], options: { submit?: boolean, requestId?: string } = {}): Promise<{ claimId: string, itemIds: string[] }> {
  const { claimId } = await ok('POST', '/api/budgets/claims', { title: 'Paint for Hamlet', ...(options.requestId ? { requestId: options.requestId } : {}) }, claimant)
  const itemIds: string[] = []
  for (const i of items) itemIds.push((await ok('POST', `/api/budgets/claims/${claimId}/items`, i, claimant)).itemId)
  if (options.submit !== false) await ok('POST', `/api/budgets/claims/${claimId}/submit`, { declared: true }, claimant)
  return { claimId, itemIds }
}
const view = (claimId: string, actor: Actor) => ok('GET', `/api/budgets/claims/${claimId}`, undefined, actor)
const figures = async (budgetId: string, lineId: string) => (await ok('GET', `/api/budgets/budgets/${budgetId}`, undefined, manager)).lines.find((l: { id: string }) => l.id === lineId).figures
const whole = (ids: string[], lineId: string, amounts: number[]) => ids.map((id, i) => ({ id, lineId, approvedMinor: amounts[i] }))

afterAll(() => setAccessProvider(testAccess))
beforeAll(async () => {
  setAccessProvider({ ...identityAccess, actor: testAccess.actor })
  setClock(NOV_24)
  for (const id of ['finance', 'payments', 'tickets', 'budgets']) await setModule(id, true)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true })
    await ensureSystemAccounts(unit.view(), 'budgets')
    await seed({ payload: { moduleId: 'budgets' } } as any, unit.view())
    await unit.commit()
    await ensureVocabularies('core')
    await ensureModuleDefaults('budgets', 'acc_testenabler')
  })
  manager = await account('Mo Manager', MANAGE)
  treasurer = await account('Tara Treasurer', [...MANAGE, 'budgets.claim.approve-any'])
})

describe('making and submitting a claim (BC-19, BC-20)', () => {
  it('needs a receipt or a reason for each item, numbers the claim, tells the holder and fixes its content', async () => {
    const { lineId, holder } = await approvedBudget()
    const claimant = await member()
    const { claimId, itemIds } = await claimWith(claimant, [item(lineId, 1_200), item(lineId, 800, { noReceiptReason: null })], { submit: false })
    expect((await view(claimId, claimant)).claim).toMatchObject({ state: 'draft', number: null, totalMinor: 2_000 })

    const early = await req('POST', `/api/budgets/claims/${claimId}/submit`, { declared: true }, claimant)
    expect(early.body.code).toBe('budgets.claim.incomplete')
    expect(early.body.fields).toEqual({ [`items.${itemIds[1]}.receipt`]: 'budgets.claim.no-receipt' })
    const up = await upload(claimId, itemIds[1]!, claimant)
    expect(up.status, JSON.stringify(up.body)).toBe(200)
    expect((await upload(claimId, itemIds[1]!, await member())).status).toBe(404)

    await ok('POST', `/api/budgets/claims/${claimId}/submit`, { declared: true }, claimant)
    const { claim, items } = await view(claimId, claimant)
    expect(claim).toMatchObject({ state: 'submitted', number: expect.stringMatching(/^2026-\d{4}$/) })
    expect(items[1].receipts).toMatchObject([{ name: 'receipt.pdf' }])
    const told = await rows<{ account_id: string }>("SELECT account_id FROM core_notifications WHERE type_key = 'budgets.claim-to-approve'")
    expect(told.map(r => r.account_id)).toContain(holder.accountId)

    expect((await req('POST', `/api/budgets/claims/${claimId}/items`, item(lineId, 100), claimant)).body.code).toBe('budgets.claim.fixed')
    expect((await req('PATCH', `/api/budgets/claims/${claimId}/items/${itemIds[0]}`, item(lineId, 100), claimant)).body.code).toBe('budgets.claim.fixed')
    const next = await claimWith(claimant, [item(lineId, 100)])
    const numbers = [claim.number, (await view(next.claimId, claimant)).claim.number].map((s: string) => Number(s.slice(5)))
    expect(numbers[1]).toBe(numbers[0]! + 1)
  })

  it('shows a claim only to its claimant and its approvers, and lists the person\'s own', async () => {
    const { lineId, holder } = await approvedBudget()
    const claimant = await member()
    const { claimId } = await claimWith(claimant, [item(lineId, 500)])
    expect((await req('GET', `/api/budgets/claims/${claimId}`, undefined, await member())).status).toBe(404)
    expect((await view(claimId, holder)).review).toMatchObject({ yours: expect.any(Array) })
    const mine = await ok('GET', '/api/budgets/expenses', undefined, claimant)
    expect(mine.claims.map((c: { id: string }) => c.id)).toEqual([claimId])
  })

  it('refuses a line that is not of an approved budget, and a date in the future', async () => {
    const { budgetId } = await ok('POST', '/api/budgets/budgets', { scope: 'general', name: `Draft ${++n}` }, manager)
    const categoryId = (await rows<{ id: string }>("SELECT id FROM budgets_categories WHERE slug = 'set'"))[0]!.id
    const { lineId: draftLine } = await ok('POST', `/api/budgets/budgets/${budgetId}/lines`, { name: 'Paint', kind: 'expense', categoryId, amountMinor: 500 }, manager)
    const claimant = await member()
    const { claimId } = await ok('POST', '/api/budgets/claims', { title: 'Paint' }, claimant)
    expect((await req('POST', `/api/budgets/claims/${claimId}/items`, item(draftLine, 100), claimant)).body.code).toBe('budgets.claim.line')
    expect((await req('POST', `/api/budgets/claims/${claimId}/items`, item(null as never, 100, { spentOn: '2026-12-01' }), claimant)).body.code).toBe('budgets.claim.future')
  })
})

describe('approving (BC-21, BC-22; C1, C3, C5)', () => {
  it('a holder approves in part; the expense posts per item, tagged with its line; the claimant is told', async () => {
    const { budgetId, lineId, holder } = await approvedBudget()
    const claimant = await member()
    const { claimId, itemIds } = await claimWith(claimant, [item(lineId, 1_200), item(lineId, 800)])
    expect((await figures(budgetId, lineId)).pendingMinor).toBe(2_000)
    expect((await ok('GET', '/api/budgets/approvals', undefined, holder)).claims.map((c: { id: string }) => c.id)).toContain(claimId)
    const { claim } = await view(claimId, holder)

    const noReason = await req('POST', `/api/budgets/claims/${claimId}/approve`, { version: claim.version, items: whole(itemIds, lineId, [1_200, 500]) }, holder)
    expect(noReason.body.code).toBe('budgets.claim.part-reason')
    const decided = [{ id: itemIds[0], lineId, approvedMinor: 1_200 }, { id: itemIds[1], lineId, approvedMinor: 500, partReason: 'Only one roll was for the show' }]
    expect((await ok('POST', `/api/budgets/claims/${claimId}/approve`, { version: claim.version, items: decided }, holder)).state).toBe('approved')

    const after = await view(claimId, claimant)
    expect(after.claim).toMatchObject({ state: 'approved', approvedMinor: 1_700 })
    expect(after.items[1]).toMatchObject({ approvedMinor: 500, partReason: 'Only one roll was for the show' })
    const line = await figures(budgetId, lineId)
    expect(line).toMatchObject({ actualMinor: 1_700, pendingMinor: 0 })
    const entries = await rows<{ amount_minor: number, budget_line_id: string | null, system_key: string | null }>(
      `SELECT e.amount_minor, e.budget_line_id, a.system_key FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id
        WHERE e.posting_id = (SELECT expense_posting_id FROM budgets_claims WHERE id = ?) ORDER BY e.amount_minor`, claimId)
    expect(entries).toEqual([
      { amount_minor: -1_700, budget_line_id: null, system_key: 'budgets.claims-payable' },
      { amount_minor: 500, budget_line_id: lineId, system_key: 'budgets.expenses' },
      { amount_minor: 1_200, budget_line_id: lineId, system_key: 'budgets.expenses' },
    ])
    const told = await rows("SELECT 1 FROM core_notifications WHERE type_key = 'budgets.claim-decided' AND account_id = ?", claimant.accountId)
    expect(told).toHaveLength(1)
    // C5: a second approval, or one on a stale view, is refused and posts nothing more.
    expect((await req('POST', `/api/budgets/claims/${claimId}/approve`, { version: claim.version, items: decided }, holder)).body.code).toBe('budgets.claim.state')
  })

  it('never approves your own claim (C1), and refuses a stale view (C5)', async () => {
    const claimant = await member()
    const { lineId } = await approvedBudget(claimant)
    const { claimId, itemIds } = await claimWith(claimant, [item(lineId, 300)])
    const own = await req('POST', `/api/budgets/claims/${claimId}/approve`, { version: 1, items: whole(itemIds, lineId, [300]) }, claimant)
    expect(own.body.code).toBe('budgets.claim.own')
    expect((await ok('GET', '/api/budgets/approvals', undefined, claimant)).claims).toEqual([])
    const stale = await req('POST', `/api/budgets/claims/${claimId}/approve`, { version: 0, items: whole(itemIds, lineId, [300]) }, treasurer)
    expect(stale.body.code).toBe('budgets.claim.changed')
    expect(await rows('SELECT 1 FROM finance_postings WHERE idempotency_key = ?', `budgets:claim:${claimId}:expense`)).toEqual([])
  })

  it('over budget, only the treasurer approves (C3), and the screen says by how much', async () => {
    const { lineId, holder } = await approvedBudget()
    const { claimId, itemIds } = await claimWith(await member(), [item(lineId, 11_300)])
    const { claim, review } = await view(claimId, holder)
    expect(review.overMinor).toBe(1_300)
    const refused = await req('POST', `/api/budgets/claims/${claimId}/approve`, { version: claim.version, items: whole(itemIds, lineId, [11_300]) }, holder)
    expect(refused.body).toMatchObject({ code: 'budgets.claim.over-budget', detail: { overMinor: '1300' } })
    await ok('POST', `/api/budgets/claims/${claimId}/approve`, { version: claim.version, items: whole(itemIds, lineId, [11_300]) }, treasurer)
  })

  it('a claim on two budgets needs both holders; the first approval moves nothing', async () => {
    const one = await approvedBudget()
    const two = await approvedBudget()
    const { claimId, itemIds } = await claimWith(await member(), [item(one.lineId, 400), item(two.lineId, 600)])
    let { claim } = await view(claimId, one.holder)
    expect((await req('POST', `/api/budgets/claims/${claimId}/approve`, { version: claim.version, items: whole(itemIds, one.lineId, [400, 600]) }, one.holder)).body.code).toBe('budgets.claim.not-approver')
    expect((await ok('POST', `/api/budgets/claims/${claimId}/approve`, { version: claim.version, items: [{ id: itemIds[0], lineId: one.lineId, approvedMinor: 400 }] }, one.holder)).state).toBe('submitted')
    expect((await ok('GET', '/api/budgets/approvals', undefined, one.holder)).claims).toEqual([])
    claim = (await view(claimId, two.holder)).claim
    expect((await ok('POST', `/api/budgets/claims/${claimId}/approve`, { version: claim.version, items: [{ id: itemIds[1], lineId: two.lineId, approvedMinor: 600 }] }, two.holder)).state).toBe('approved')
    expect((await view(claimId, two.holder)).claim.approvedMinor).toBe(1_000)
  })
})

describe('sending back, declining and withdrawing (BC-23, BC-24)', () => {
  it('a returned claim is editable and its resubmission is logged; a declined one posts nothing', async () => {
    const { lineId, holder } = await approvedBudget()
    const claimant = await member()
    const { claimId, itemIds } = await claimWith(claimant, [item(lineId, 900)])
    let { claim } = await view(claimId, holder)
    expect((await req('POST', `/api/budgets/claims/${claimId}/return`, { version: claim.version }, holder)).status).toBe(422)
    await ok('POST', `/api/budgets/claims/${claimId}/return`, { version: claim.version, note: 'Please add the receipt' }, holder)
    await ok('PATCH', `/api/budgets/claims/${claimId}/items/${itemIds[0]}`, item(lineId, 850), claimant)
    await ok('POST', `/api/budgets/claims/${claimId}/submit`, { declared: true }, claimant)
    const after = await view(claimId, claimant)
    expect(after.events.map((e: { action: string }) => e.action)).toEqual(['submitted', 'returned', 'resubmitted'])
    expect(after.events[1].note).toBe('Please add the receipt')
    claim = after.claim
    await ok('POST', `/api/budgets/claims/${claimId}/decline`, { version: claim.version, note: 'Not for the theatre' }, holder)
    expect((await view(claimId, claimant)).claim).toMatchObject({ state: 'declined', expensePostingId: null })
  })

  it('a claimant withdraws a claim not yet decided, and it leaves the queue', async () => {
    const { lineId, holder } = await approvedBudget()
    const claimant = await member()
    const { claimId } = await claimWith(claimant, [item(lineId, 900)])
    await ok('POST', `/api/budgets/claims/${claimId}/withdraw`, {}, claimant)
    expect((await ok('GET', '/api/budgets/approvals', undefined, holder)).claims).toEqual([])
    expect((await req('POST', `/api/budgets/claims/${claimId}/withdraw`, {}, claimant)).body.code).toBe('budgets.claim.state')
  })
})

describe('voiding (BC-25)', () => {
  it('the treasurer voids an approved claim and the expense is reversed; a holder cannot', async () => {
    const { budgetId, lineId, holder } = await approvedBudget()
    const { claimId, itemIds } = await claimWith(await member(), [item(lineId, 700)])
    await ok('POST', `/api/budgets/claims/${claimId}/approve`, { version: (await view(claimId, holder)).claim.version, items: whole(itemIds, lineId, [700]) }, holder)
    const { claim } = await view(claimId, treasurer)
    expect((await req('POST', `/api/budgets/claims/${claimId}/void`, { version: claim.version, note: 'Bought twice' }, holder)).status).toBe(403)
    await ok('POST', `/api/budgets/claims/${claimId}/void`, { version: claim.version, note: 'Bought twice' }, treasurer)
    expect((await view(claimId, treasurer)).claim.state).toBe('voided')
    expect((await figures(budgetId, lineId)).actualMinor).toBe(0)
  })
})

describe('a claim fulfils its request (BC-27), and the marks (BC-28)', () => {
  it('an approved claim raises its request\'s fulfilled amount', async () => {
    const { lineId, holder } = await approvedBudget()
    const claimant = await member()
    const { requestId } = await ok('POST', '/api/budgets/requests', { lineId, amountMinor: 1_000, description: 'Paint' }, claimant)
    await ok('POST', `/api/budgets/requests/${requestId}/approve`, {}, holder)
    const { claimId, itemIds } = await claimWith(claimant, [item(lineId, 1_000)], { requestId })
    await ok('POST', `/api/budgets/claims/${claimId}/approve`, { version: (await view(claimId, holder)).claim.version, items: whole(itemIds, lineId, [1_000]) }, holder)
    expect(await rows('SELECT state, fulfilled_minor FROM budgets_spending_requests WHERE id = ?', requestId)).toEqual([{ state: 'fulfilled', fulfilled_minor: 1_000 }])
  })

  it('marks old items late and a large claim with no request "not asked first"; neither is refused', async () => {
    const { lineId, holder } = await approvedBudget()
    await inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit.view(), 'budgets.requests.expected-above', 500, { reason: 'test', confirm: true })
      await unit.commit()
    })
    const { claimId } = await claimWith(await member(), [item(lineId, 600, { spentOn: '2026-06-01' }), item(lineId, 100)])
    const { review, items } = await view(claimId, holder)
    expect(review.marks).toEqual({ lateItems: [items[0].id], notAskedFirst: true })
  })
})

describe('a budget with claims open, and erasure', () => {
  it('does not close while a claim on it waits', async () => {
    const { budgetId, lineId } = await approvedBudget()
    await claimWith(await member(), [item(lineId, 100)])
    expect((await req('POST', `/api/budgets/budgets/${budgetId}/close`, {}, treasurer)).body.code).toBe('budgets.budget.open-claims')
  })

  it('holds erasure while a claim waits, and erases a draft at once', async () => {
    const { lineId } = await approvedBudget()
    const claimant = await member()
    const { claimId: open } = await claimWith(claimant, [item(lineId, 100)])
    const { claimId: draft } = await claimWith(claimant, [item(lineId, 100)], { submit: false })
    expect(await inContext(() => erasureHolds(claimant.accountId!))).toContain('budgets.open-claim')
    await ok('POST', `/api/budgets/claims/${open}/withdraw`, {}, claimant)
    expect(await inContext(() => erasureHolds(claimant.accountId!))).not.toContain('budgets.open-claim')
    await inContext(() => eraseAccount(claimant.accountId!))
    expect(await rows('SELECT claimant_id, title FROM budgets_claims WHERE id = ?', draft)).toEqual([{ claimant_id: null, title: '' }])
    expect(await rows('SELECT description FROM budgets_claim_items WHERE claim_id = ?', draft)).toEqual([{ description: '' }])
  })
})
