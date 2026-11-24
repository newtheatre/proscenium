// Budgets and claims, part 3: spending requests (BC-15 to BC-17). A member asks to spend on a line of an
// approved budget; a holder who is not the requester decides, the treasurer over budget; approved, it
// counts as committed until it lapses; and a budget does not close while one is open on it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { setAccessProvider } from '#kit/access'
import { call, env, inContext, person, rows, server, setModule, testAccess } from '../../../../tests/integration/helpers'
import { identityAccess } from '../../../core/server/identity/access'
import { ensureSystemAccounts } from '../../../finance/server/services'
import { ensureVocabularies } from '../../../core/server/vocabularies/service'
import { ensureModuleDefaults } from '../../../core/server/identity/defaults'
import seed from '../../server/listeners/categories'
import { daily } from '../../server/requests'
import budgetsPost from '../../server/api/budgets/budgets/index.post'
import budgetGet from '../../server/api/budgets/budgets/[id].get'
import proposePost from '../../server/api/budgets/budgets/[id]/propose.post'
import approvePost from '../../server/api/budgets/budgets/[id]/approve.post'
import closePost from '../../server/api/budgets/budgets/[id]/close.post'
import linesPost from '../../server/api/budgets/budgets/[id]/lines.post'
import holdersPost from '../../server/api/budgets/budgets/[id]/holders.post'
import requestsGet from '../../server/api/budgets/requests/index.get'
import requestsPost from '../../server/api/budgets/requests/index.post'
import requestApprove from '../../server/api/budgets/requests/[id]/approve.post'
import requestDecline from '../../server/api/budgets/requests/[id]/decline.post'
import requestWithdraw from '../../server/api/budgets/requests/[id]/withdraw.post'
import approvalsGet from '../../server/api/budgets/approvals.get'

const handle = server({
  'POST /api/budgets/budgets': budgetsPost,
  'GET /api/budgets/budgets/:id': budgetGet,
  'POST /api/budgets/budgets/:id/propose': proposePost,
  'POST /api/budgets/budgets/:id/approve': approvePost,
  'POST /api/budgets/budgets/:id/close': closePost,
  'POST /api/budgets/budgets/:id/lines': linesPost,
  'POST /api/budgets/budgets/:id/holders': holdersPost,
  'GET /api/budgets/requests': requestsGet,
  'POST /api/budgets/requests': requestsPost,
  'POST /api/budgets/requests/:id/approve': requestApprove,
  'POST /api/budgets/requests/:id/decline': requestDecline,
  'POST /api/budgets/requests/:id/withdraw': requestWithdraw,
  'GET /api/budgets/approvals': approvalsGet,
})

const NOV_24 = Date.UTC(2026, 10, 24, 12)
const MANAGE = ['budgets.budget.view', 'budgets.budget.manage', 'budgets.budget.approve', 'budgets.budget.hold', 'budgets.category.manage']
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

/** A signed-in account in the database, with a site-wide role of these abilities if any, as an actor. */
async function account(name: string, abilities: string[] = []): Promise<Actor> {
  const id = newId('acc')
  await env.DB.prepare("INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, ?, 'invite', ?, ?)").bind(id, name, NOV_24, NOV_24).run()
  if (abilities.length) {
    const roleId = newId('rol')
    await env.DB.prepare("INSERT INTO core_roles (id, key, name, fixed, opens_members_area, needs_managed_identity, expiry_rule, created_at) VALUES (?, ?, 'Test role', 0, 1, 0, 'none', ?)").bind(roleId, `role-${roleId.slice(-10)}`, NOV_24).run()
    for (const a of abilities) await env.DB.prepare('INSERT INTO core_role_abilities (role_id, ability) VALUES (?, ?)').bind(roleId, a).run()
    await env.DB.prepare("INSERT INTO core_grants (id, account_id, role_id, scope, starts_at, granted_by, granted_at) VALUES (?, ?, ?, 'site', ?, 'acc_testgranter', ?)").bind(newId('gra'), id, roleId, NOV_24 - 1000, NOV_24 - 1000).run()
  }
  return actorOf(id)
}
async function actorOf(accountId: string): Promise<Actor> {
  return person([], { accountId, reassertedAt: NOV_24 })
}

let manager: Actor
let treasurer: Actor
let n = 0
/** An approved general budget with one expense line of £100, and a holder for it. */
async function approvedBudget(): Promise<{ budgetId: string, lineId: string, holder: Actor }> {
  const { budgetId } = await ok('POST', '/api/budgets/budgets', { scope: 'general', name: `Budget ${++n}` }, manager)
  const categoryId = (await rows<{ id: string }>("SELECT id FROM budgets_categories WHERE slug = 'set'"))[0]!.id
  const { lineId } = await ok('POST', `/api/budgets/budgets/${budgetId}/lines`, { name: 'Set', kind: 'expense', categoryId, amountMinor: 10_000 }, manager)
  await ok('POST', `/api/budgets/budgets/${budgetId}/propose`, {}, manager)
  await ok('POST', `/api/budgets/budgets/${budgetId}/approve`, {}, treasurer)
  const holder = await account(`Holder ${n}`)
  await ok('POST', `/api/budgets/budgets/${budgetId}/holders`, { accountId: holder.accountId }, manager)
  return { budgetId, lineId, holder: await actorOf(holder.accountId!) }
}
const member = () => account(`Member ${++n}`, ['budgets.request.make'])
const ask = (lineId: string, amountMinor: number, actor: Actor) => req('POST', '/api/budgets/requests', { lineId, amountMinor, description: 'Black paint and brushes for the flats' }, actor)
const line = async (budgetId: string, lineId: string) => (await ok('GET', `/api/budgets/budgets/${budgetId}`, undefined, manager)).lines.find((l: { id: string }) => l.id === lineId)

// Holders are found the way the live site finds them, from grants in the database.
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
    await ensureModuleDefaults('budgets')
  })
  manager = await account('Mo Manager', MANAGE)
  treasurer = await account('Tara Treasurer', [...MANAGE, 'budgets.claim.approve-any'])
})

describe('asking to spend (BC-15)', () => {
  it('offers only lines of approved budgets, and tells the holders', async () => {
    const { lineId, holder } = await approvedBudget()
    const { budgetId: draftId } = await ok('POST', '/api/budgets/budgets', { scope: 'general', name: `Draft ${++n}` }, manager)
    const categoryId = (await rows<{ id: string }>("SELECT id FROM budgets_categories WHERE slug = 'set'"))[0]!.id
    const draftLine = (await ok('POST', `/api/budgets/budgets/${draftId}/lines`, { name: 'Paint', kind: 'expense', categoryId, amountMinor: 500 }, manager)).lineId
    const asker = await member()
    const offered = await ok('GET', '/api/budgets/requests', undefined, asker)
    expect(offered.lines.map((l: { id: string }) => l.id)).toContain(lineId)
    expect(offered.lines.map((l: { id: string }) => l.id)).not.toContain(draftLine)
    expect((await ask(draftLine, 500, asker)).body.code).toBe('budgets.request.line')
    const { requestId } = (await ask(lineId, 4_000, asker)).body
    const told = await rows<{ account_id: string }>("SELECT account_id FROM core_notifications WHERE type_key = 'budgets.request-to-approve'")
    expect(told.map(r => r.account_id)).toContain(holder.accountId)
    const mine = (await ok('GET', '/api/budgets/requests', undefined, asker)).requests
    expect(mine).toMatchObject([{ id: requestId, state: 'requested', amountMinor: 4_000 }])
  })
})

describe('deciding (BC-16)', () => {
  it('a holder approves, and it counts as committed; it waits in their queue until then', async () => {
    const { budgetId, lineId, holder } = await approvedBudget()
    const { requestId } = (await ask(lineId, 4_000, await member())).body
    expect((await ok('GET', '/api/budgets/approvals', undefined, holder)).requests.map((r: { id: string }) => r.id)).toEqual([requestId])
    const stranger = await account('Stranger')
    expect((await ok('GET', '/api/budgets/approvals', undefined, stranger)).requests).toEqual([])
    expect((await req('POST', `/api/budgets/requests/${requestId}/approve`, {}, stranger)).body.code).toBe('budgets.request.not-holder')
    await ok('POST', `/api/budgets/requests/${requestId}/approve`, {}, holder)
    const figures = (await line(budgetId, lineId)).figures
    expect(figures.committedMinor).toBe(4_000)
    expect(figures.remainingMinor).toBe(6_000)
    const [row] = await rows<{ state: string, lapses_on: string }>('SELECT state, lapses_on FROM budgets_spending_requests WHERE id = ?', requestId)
    expect(row).toEqual({ state: 'approved', lapses_on: '2027-01-23' })
    expect((await ok('GET', '/api/budgets/approvals', undefined, holder)).requests).toEqual([])
  })

  it('refuses the requester deciding their own, even as a holder', async () => {
    const { budgetId, lineId } = await approvedBudget()
    const asker = await member()
    await ok('POST', `/api/budgets/budgets/${budgetId}/holders`, { accountId: asker.accountId }, manager)
    const { requestId } = (await ask(lineId, 1_000, asker)).body
    expect((await req('POST', `/api/budgets/requests/${requestId}/approve`, {}, asker)).body.code).toBe('budgets.request.own')
    expect((await ok('GET', '/api/budgets/approvals', undefined, asker)).requests.map((r: { id: string }) => r.id)).not.toContain(requestId)
  })

  it('over budget only the treasurer approves, and the refusal says by how much', async () => {
    const { budgetId, lineId, holder } = await approvedBudget()
    const { requestId } = (await ask(lineId, 12_500, await member())).body
    const queued = (await ok('GET', '/api/budgets/approvals', undefined, holder)).requests[0]
    expect(queued.overMinor).toBe(2_500)
    const refused = await req('POST', `/api/budgets/requests/${requestId}/approve`, {}, holder)
    expect(refused.body.code).toBe('budgets.request.over-budget')
    expect(refused.body.detail.overMinor).toBe('2500')
    await ok('POST', `/api/budgets/requests/${requestId}/approve`, {}, treasurer)
    expect((await line(budgetId, lineId)).figures.over).toBe(true)
  })

  it('declining needs a note, which the requester is told', async () => {
    const { lineId, holder } = await approvedBudget()
    const asker = await member()
    const { requestId } = (await ask(lineId, 1_000, asker)).body
    expect((await req('POST', `/api/budgets/requests/${requestId}/decline`, {}, holder)).status).toBe(422)
    await ok('POST', `/api/budgets/requests/${requestId}/decline`, { note: 'Use the paint in the store' }, holder)
    expect((await ok('GET', '/api/budgets/requests', undefined, asker)).requests[0]).toMatchObject({ state: 'declined', decisionNote: 'Use the paint in the store' })
    const told = await rows<{ account_id: string }>("SELECT account_id FROM core_notifications WHERE type_key = 'budgets.request-decided'")
    expect(told.map(r => r.account_id)).toContain(asker.accountId)
  })

  it('a requester withdraws their own; nobody else but a holder may', async () => {
    const { lineId } = await approvedBudget()
    const asker = await member()
    const { requestId } = (await ask(lineId, 1_000, asker)).body
    expect((await req('POST', `/api/budgets/requests/${requestId}/withdraw`, {}, await member())).body.code).toBe('budgets.request.not-yours')
    await ok('POST', `/api/budgets/requests/${requestId}/withdraw`, {}, asker)
    expect((await req('POST', `/api/budgets/requests/${requestId}/approve`, {}, treasurer)).body.code).toBe('budgets.request.state')
  })
})

describe('lapsing (BC-17) and closing (BC-13)', () => {
  it('an approved request past its date lapses and stops counting as committed', async () => {
    const { budgetId, lineId, holder } = await approvedBudget()
    const { requestId } = (await ask(lineId, 3_000, await member())).body
    await ok('POST', `/api/budgets/requests/${requestId}/approve`, {}, holder)
    setClock(Date.UTC(2027, 0, 25, 12))
    try {
      await inContext(async () => {
        const unit = createUnit()
        await daily(unit.view())
        await unit.commit()
      })
      expect((await rows<{ state: string }>('SELECT state FROM budgets_spending_requests WHERE id = ?', requestId))[0]!.state).toBe('lapsed')
      expect((await line(budgetId, lineId)).figures.committedMinor).toBe(0)
    }
    finally { setClock(NOV_24) }
  })

  it('a budget does not close while a request on it is waiting', async () => {
    const { budgetId, lineId } = await approvedBudget()
    const { requestId } = (await ask(lineId, 1_000, await member())).body
    const refused = await req('POST', `/api/budgets/budgets/${budgetId}/close`, {}, treasurer)
    expect(refused.body.code).toBe('budgets.budget.open-requests')
    await ok('POST', `/api/budgets/requests/${requestId}/decline`, { note: 'Not this term' }, treasurer)
    await ok('POST', `/api/budgets/budgets/${budgetId}/close`, {}, treasurer)
  })
})
