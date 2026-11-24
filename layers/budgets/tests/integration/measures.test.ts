// Budgets' figures for Reports (BC-35): budgeted, committed and spent by line, production and month,
// pending claims, aggregates only, read through core's readMeasure.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { setAccessProvider } from '#kit/access'
import { call, env, inContext, person, rows, server, setModule, testAccess } from '../../../../tests/integration/helpers'
import { identityAccess } from '../../../core/server/identity/access'
import { ensureSystemAccounts } from '../../../finance/server/services'
import { ensureVocabularies } from '../../../core/server/vocabularies/service'
import { ensureModuleDefaults } from '../../../core/server/identity/defaults'
import seed from '../../server/listeners/categories'
import { readMeasure } from '../../../core/server/measures/service'
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
import requestsPost from '../../server/api/budgets/requests/index.post'
import requestApprove from '../../server/api/budgets/requests/[id]/approve.post'

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
  'POST /api/budgets/requests': requestsPost,
  'POST /api/budgets/requests/:id/approve': requestApprove,
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

const read = (id: string, query: Record<string, unknown>) => inContext(() => readMeasure(id, { from: '2026-11-01', to: '2026-11-30', by: [], ...query } as any))

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

describe('budgets\' figures (BC-35)', () => {
  it('answers budgeted, committed and spent by line, and spent by month, as keys and numbers only', async () => {
    const { budgetId, lineId, holder } = await approvedBudget()
    const claimant = await member(['budgets.request.make'])
    const { requestId } = await ok('POST', '/api/budgets/requests', { lineId, amountMinor: 3_000, description: 'Gaffer tape' }, claimant)
    await ok('POST', `/api/budgets/requests/${requestId}/approve`, {}, holder)
    const { claimId, itemId } = await submitted(claimant, lineId, 2_500)
    expect((await approve(claimId, holder, [{ id: itemId, lineId, approvedMinor: 2_500 }])).status).toBe(200)

    const byLine = { by: ['budgets.line'], filter: undefined }
    const budgeted = await read('budgets.budgeted', byLine)
    expect(budgeted).toMatchObject({ state: 'ok' })
    expect((budgeted as any).rows).toContainEqual({ keys: { 'budgets.line': lineId }, currency: 'GBP', value: 100_000 })
    expect((await read('budgets.committed', byLine) as any).rows).toContainEqual({ keys: { 'budgets.line': lineId }, currency: 'GBP', value: 3_000 })
    expect((await read('budgets.spent', byLine) as any).rows).toContainEqual({ keys: { 'budgets.line': lineId }, currency: 'GBP', value: 2_500 })
    const months = await read('budgets.spent', { from: '2026-10-01', to: '2026-11-30', by: ['budgets.line', 'month'] }) as any
    expect(months.rows.filter((r: { keys: Record<string, string> }) => r.keys['budgets.line'] === lineId)).toEqual([{ keys: { 'budgets.line': lineId, 'month': '2026-11' }, currency: 'GBP', value: 2_500 }])
    // Outside the period nothing was spent.
    expect((await read('budgets.spent', { from: '2026-10-01', to: '2026-10-31', by: ['budgets.line'] }) as any).rows.some((r: { keys: Record<string, string> }) => r.keys['budgets.line'] === lineId)).toBe(false)
    expect(budgetId).toBeTruthy()
  })

  it('counts claims awaiting a decision and what they ask for', async () => {
    const before = await read('budgets.claims-pending', {}) as any
    const value = await read('budgets.claims-pending-value', {}) as any
    const { lineId } = await approvedBudget()
    await submitted(await member(), lineId, 1_234)
    expect((await read('budgets.claims-pending', {}) as any).rows[0].value).toBe(before.rows[0].value + 1)
    const now = await read('budgets.claims-pending-value', {}) as any
    const gbp = (rows: { currency: string, value: number }[]) => rows.find(r => r.currency === 'GBP')?.value ?? 0
    expect(gbp(now.rows)).toBe(gbp(value.rows) + 1_234)
  })

  it('cannot be scoped to a venue, and refuses to be read by someone without budget.view', async () => {
    expect(await read('budgets.budgeted', { scope: { venue: 'ven_x' } })).toEqual({ state: 'unsupported' })
    const outsider = await member()
    await expect(inContext(() => readMeasure('budgets.spent', { from: '2026-11-01', to: '2026-11-30', by: [] }, outsider as any))).rejects.toMatchObject({ code: 'core.access.denied' })
  })
})
