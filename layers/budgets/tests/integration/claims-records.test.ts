// Budgets and claims, part 4: claims kept as a financial record then anonymised (BC-33), the
// over-budget notice once per crossing (BC-34), approvers chased, costs still to come at a period's
// close (BC-36) and the budgets spreadsheet (BC-37).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { setAccessProvider } from '#kit/access'
import { call, env, inContext, person, rows, server, setModule, testAccess } from '../../../../tests/integration/helpers'
import { identityAccess } from '../../../core/server/identity/access'
import { ensureSystemAccounts } from '../../../finance/server/services'
import { ensureVocabularies } from '../../../core/server/vocabularies/service'
import { ensureModuleDefaults } from '../../../core/server/identity/defaults'
import seed from '../../server/listeners/categories'
import overBudget from '../../server/listeners/over-budget'
import sweepClaims from '../../server/tasks/sweep-claims'
import claimsToCome from '../../server/contributions/finance.period-close-check/claims-to-come'
import erasure from '../../server/contributions/core.erasure-handler/budgets'
import budgetsPost from '../../server/api/budgets/budgets/index.post'
import proposePost from '../../server/api/budgets/budgets/[id]/propose.post'
import approveBudget from '../../server/api/budgets/budgets/[id]/approve.post'
import linesPost from '../../server/api/budgets/budgets/[id]/lines.post'
import holdersPost from '../../server/api/budgets/budgets/[id]/holders.post'
import claimsPost from '../../server/api/budgets/claims/index.post'
import claimGet from '../../server/api/budgets/claims/[id].get'
import itemsPost from '../../server/api/budgets/claims/[id]/items/index.post'
import submitPost from '../../server/api/budgets/claims/[id]/submit.post'
import approvePost from '../../server/api/budgets/claims/[id]/approve.post'
import withdrawPost from '../../server/api/budgets/claims/[id]/withdraw.post'
import voidPost from '../../server/api/budgets/claims/[id]/void.post'
import requestsPost from '../../server/api/budgets/requests/index.post'
import requestApprove from '../../server/api/budgets/requests/[id]/approve.post'
import exportGet from '../../server/api/budgets/export.csv.get'

const handle = server({
  'POST /api/budgets/budgets': budgetsPost,
  'POST /api/budgets/budgets/:id/propose': proposePost,
  'POST /api/budgets/budgets/:id/approve': approveBudget,
  'POST /api/budgets/budgets/:id/lines': linesPost,
  'POST /api/budgets/budgets/:id/holders': holdersPost,
  'POST /api/budgets/claims': claimsPost,
  'GET /api/budgets/claims/:id': claimGet,
  'POST /api/budgets/claims/:id/items': itemsPost,
  'POST /api/budgets/claims/:id/submit': submitPost,
  'POST /api/budgets/claims/:id/approve': approvePost,
  'POST /api/budgets/claims/:id/withdraw': withdrawPost,
  'POST /api/budgets/claims/:id/void': voidPost,
  'POST /api/budgets/requests': requestsPost,
  'POST /api/budgets/requests/:id/approve': requestApprove,
  'GET /api/budgets/export.csv': exportGet,
})

const NOV_24 = Date.UTC(2026, 10, 24, 12)
const MANAGE = ['budgets.budget.view', 'budgets.budget.manage', 'budgets.budget.approve', 'budgets.budget.hold', 'budgets.category.manage']
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

let manager: Actor
let treasurer: Actor
let n = 0
async function approvedBudget(): Promise<{ budgetId: string, lineId: string, holder: Actor }> {
  const { budgetId } = await ok('POST', '/api/budgets/budgets', { scope: 'general', name: `Records ${++n}` }, manager)
  const categoryId = (await rows<{ id: string }>("SELECT id FROM budgets_categories WHERE slug = 'set'"))[0]!.id
  const { lineId } = await ok('POST', `/api/budgets/budgets/${budgetId}/lines`, { name: 'Set', kind: 'expense', categoryId, amountMinor: 100_000 }, manager)
  await ok('POST', `/api/budgets/budgets/${budgetId}/propose`, {}, manager)
  await ok('POST', `/api/budgets/budgets/${budgetId}/approve`, {}, treasurer)
  const holder = await account(`Holder ${n}`)
  await ok('POST', `/api/budgets/budgets/${budgetId}/holders`, { accountId: holder.accountId }, manager)
  return { budgetId, lineId, holder }
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

const DAY = 86_400_000
async function inUnit(run: (unit: ReturnType<ReturnType<typeof createUnit>['view']>) => Promise<void>) {
  await inContext(async () => {
    const unit = createUnit()
    await run(unit.view())
    await unit.commit()
  })
}
const sweep = () => inUnit(unit => sweepClaims(unit as any))
const told = async (type: string, accountId?: string | null) =>
  (await rows<{ n: number }>('SELECT count(*) AS n FROM core_notifications WHERE type_key = ? AND account_id = ?', type, accountId ?? ''))[0]!.n

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

describe('retention (BC-33)', () => {
  it('anonymises a settled claim once budgets.retention.claims has passed since it was last acted on, keeping its amounts', async () => {
    const { lineId, holder } = await approvedBudget()
    const claimant = await member()
    const { claimId, itemId } = await submitted(claimant, lineId, 2_000)
    expect((await approve(claimId, holder, [{ id: itemId, lineId, approvedMinor: 2_000 }])).status).toBe(200)
    const { claimId: withdrawn } = await submitted(claimant, lineId, 500)
    await ok('POST', `/api/budgets/claims/${withdrawn}/withdraw`, {}, claimant)

    // Approved and unpaid is still owed: it is not final, so it keeps its person.
    setClock(NOV_24 + 7 * 365 * DAY)
    try {
      await sweep()
      const kept = (await rows<{ claimant_id: string | null, title: string }>('SELECT claimant_id, title FROM budgets_claims WHERE id = ?', claimId))[0]!
      expect(kept).toMatchObject({ claimant_id: claimant.accountId, title: 'Timber for the set' })
      const gone = (await rows<{ claimant_id: string | null, title: string, total_minor: number }>('SELECT claimant_id, title, total_minor FROM budgets_claims WHERE id = ?', withdrawn))[0]!
      expect(gone).toMatchObject({ claimant_id: null, title: '', total_minor: 500 })
      expect((await rows<{ description: string }>('SELECT description FROM budgets_claim_items WHERE claim_id = ?', withdrawn))[0]!.description).toBe('')
    }
    finally { setClock(NOV_24) }
  })

  it('leaves a settled claim alone inside the retention period', async () => {
    const { lineId } = await approvedBudget()
    const claimant = await member()
    const { claimId } = await submitted(claimant, lineId, 400)
    await ok('POST', `/api/budgets/claims/${claimId}/withdraw`, {}, claimant)
    await sweep()
    expect((await rows<{ title: string }>('SELECT title FROM budgets_claims WHERE id = ?', claimId))[0]!.title).toBe('Timber for the set')
  })

  it('erasure still clears a person\'s unposted claims at once through the same clearing', async () => {
    const { lineId } = await approvedBudget()
    const claimant = await member()
    const { claimId } = await submitted(claimant, lineId, 300)
    await ok('POST', `/api/budgets/claims/${claimId}/withdraw`, {}, claimant)
    await inUnit(unit => erasure.erase(unit as any, { accountId: claimant.accountId! }))
    expect((await rows<{ claimant_id: string | null, title: string }>('SELECT claimant_id, title FROM budgets_claims WHERE id = ?', claimId))[0]).toMatchObject({ claimant_id: null, title: '' })
  })
})

describe('the over-budget notice (BC-34)', () => {
  it('tells holders and treasurers once when spent and committed pass budgeted, and again only after it comes back under', async () => {
    const { lineId, holder } = await approvedBudget()
    const claimant = await member()
    const { claimId, itemId } = await submitted(claimant, lineId, 120_000)
    expect((await approve(claimId, treasurer, [{ id: itemId, lineId, approvedMinor: 120_000 }])).status).toBe(200)
    const decided = { payload: { claimId, decision: 'approved', amountMinor: 120_000 } } as any
    await inUnit(unit => overBudget(decided, unit as any))
    expect(await told('budgets.over-budget', holder.accountId)).toBe(1)
    expect(await told('budgets.over-budget', treasurer.accountId)).toBeGreaterThanOrEqual(1)
    const marked = async () => (await rows<{ at: number | null }>('SELECT over_notified_at AS at FROM budgets_lines WHERE id = ?', lineId))[0]!.at

    // Still over: no second notice, from the listener or the daily sweep.
    await inUnit(unit => overBudget(decided, unit as any))
    await sweep()
    expect(await told('budgets.over-budget', holder.accountId)).toBe(1)
    expect(await marked()).not.toBeNull()

    // Voided, the line is back within it: the mark clears, so the next crossing is told.
    await ok('POST', `/api/budgets/claims/${claimId}/void`, { version: await version(claimId, treasurer), note: 'Paid twice by mistake' }, treasurer)
    await inUnit(unit => overBudget({ payload: { claimId, decision: 'voided', amountMinor: 120_000 } } as any, unit as any))
    expect(await marked()).toBeNull()
    const again = await submitted(claimant, lineId, 110_000)
    expect((await approve(again.claimId, treasurer, [{ id: again.itemId, lineId, approvedMinor: 110_000 }])).status).toBe(200)
    await sweep()
    expect(await told('budgets.over-budget', holder.accountId)).toBe(2)
  })

  it('says nothing while a line is within budget', async () => {
    const { lineId, holder } = await approvedBudget()
    const claimant = await member()
    const { claimId, itemId } = await submitted(claimant, lineId, 5_000)
    expect((await approve(claimId, holder, [{ id: itemId, lineId, approvedMinor: 5_000 }])).status).toBe(200)
    await inUnit(unit => overBudget({ payload: { claimId } } as any, unit as any))
    expect(await told('budgets.over-budget', holder.accountId)).toBe(0)
  })

  it('counts an approved spending request as committed', async () => {
    const { lineId, holder } = await approvedBudget()
    const asker = await member(['budgets.request.make'])
    const { requestId } = await ok('POST', '/api/budgets/requests', { lineId, amountMinor: 150_000, description: 'A hired revolve' }, asker)
    await ok('POST', `/api/budgets/requests/${requestId}/approve`, {}, treasurer)
    await inUnit(unit => overBudget({ payload: { requestId } } as any, unit as any))
    expect(await told('budgets.over-budget', holder.accountId)).toBe(1)
  })
})

describe('chasing approvers', () => {
  it('puts an undecided claim and request to their approvers again after budgets.reminders.approver-after, then not again until it passes once more', async () => {
    const { lineId, holder } = await approvedBudget()
    const claimant = await member(['budgets.request.make'])
    await submitted(claimant, lineId, 700)
    const { requestId } = await ok('POST', '/api/budgets/requests', { lineId, amountMinor: 900, description: 'Gaffer tape' }, claimant)
    const claimsBefore = await told('budgets.claim-to-approve', holder.accountId)
    const requestsBefore = await told('budgets.request-to-approve', holder.accountId)

    await sweep()
    expect(await told('budgets.claim-to-approve', holder.accountId)).toBe(claimsBefore)

    setClock(NOV_24 + 8 * DAY)
    try {
      await sweep()
      expect(await told('budgets.claim-to-approve', holder.accountId)).toBe(claimsBefore + 1)
      expect(await told('budgets.request-to-approve', holder.accountId)).toBe(requestsBefore + 1)
      await sweep()
      expect(await told('budgets.claim-to-approve', holder.accountId)).toBe(claimsBefore + 1)
      expect((await rows<{ chased_at: number }>('SELECT chased_at FROM budgets_spending_requests WHERE id = ?', requestId))[0]!.chased_at).toBe(NOV_24 + 8 * DAY)
    }
    finally { setClock(NOV_24) }
  })
})

describe('costs still to come at a period\'s close (BC-36)', () => {
  it('warns of claims waiting longer than the reminder with items spent in the period, and never blocks', async () => {
    const { lineId } = await approvedBudget()
    await submitted(await member(), lineId, 800)
    const period = { id: 'per_test', startsOn: '2026-11-01', endsOn: '2026-11-30', startsAt: Date.UTC(2026, 10, 1), endsAt: Date.UTC(2026, 11, 1) }
    expect(await inContext(() => claimsToCome.warnings(period))).toEqual([])
    setClock(NOV_24 + 8 * DAY)
    try {
      const warnings = await inContext(() => claimsToCome.warnings(period))
      expect(warnings).toHaveLength(1)
      expect(warnings[0]!.to).toBe('/console/budgets/approvals')
      expect(await inContext(() => claimsToCome.warnings({ ...period, startsOn: '2026-10-01', endsOn: '2026-10-31' }))).toEqual([])
      expect('blockers' in claimsToCome).toBe(false)
    }
    finally { setClock(NOV_24) }
  })
})

describe('the budgets spreadsheet (BC-37)', () => {
  it('lists every line with its figures, guarded against formulas, and is audited', async () => {
    const { budgetId } = await ok('POST', '/api/budgets/budgets', { scope: 'general', name: '=HYPERLINK("x")' }, manager)
    const categoryId = (await rows<{ id: string }>("SELECT id FROM budgets_categories WHERE slug = 'set'"))[0]!.id
    await ok('POST', `/api/budgets/budgets/${budgetId}/lines`, { name: 'Paint', kind: 'expense', categoryId, amountMinor: 12_345 }, manager)
    const r = await req('GET', '/api/budgets/export.csv', undefined, manager)
    expect(r.status).toBe(200)
    expect(r.text.split('\r\n')[0]).toBe('Budget,For,Kind,State,Year starting,Line,Expense or income,Currency,Budgeted,Committed,"Claimed, awaiting approval",Spent or received,Remaining')
    expect(r.text).toContain('"\'=HYPERLINK(""x"")",')
    expect(r.text).toMatch(/Paint,expense,GBP,123\.45,0\.00,0\.00,0\.00,123\.45/)
    const audit = await rows<{ detail: string }>("SELECT detail FROM core_audit WHERE action = 'read' AND detail LIKE '%budgetsExport%'")
    expect(audit.length).toBeGreaterThan(0)
    expect((await req('GET', '/api/budgets/export.csv', undefined, await member())).status).toBe(403)
  })
})
