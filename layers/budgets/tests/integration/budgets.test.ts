// Budgets and claims, part 2: the plan. Categories seeded and mapped to expense accounts, budgets made
// per production, department and year, season or purpose, approved by someone other than who proposed
// them, revised with a reason, closed and reopened; spent read from Finance to the penny.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import { balances, ensureSystemAccounts, postEntries } from '../../../finance/server/services'
import { ensureVocabularies } from '../../../core/server/vocabularies/service'
import seed from '../../server/listeners/categories'
import budgetsGet from '../../server/api/budgets/budgets/index.get'
import budgetsPost from '../../server/api/budgets/budgets/index.post'
import newGet from '../../server/api/budgets/budgets/new.get'
import budgetGet from '../../server/api/budgets/budgets/[id].get'
import budgetPatch from '../../server/api/budgets/budgets/[id].patch'
import proposePost from '../../server/api/budgets/budgets/[id]/propose.post'
import approvePost from '../../server/api/budgets/budgets/[id]/approve.post'
import sendBackPost from '../../server/api/budgets/budgets/[id]/send-back.post'
import closePost from '../../server/api/budgets/budgets/[id]/close.post'
import reopenPost from '../../server/api/budgets/budgets/[id]/reopen.post'
import linesPost from '../../server/api/budgets/budgets/[id]/lines.post'
import orderPut from '../../server/api/budgets/budgets/[id]/order.put'
import linePatch from '../../server/api/budgets/lines/[id].patch'
import revisePost from '../../server/api/budgets/lines/[id]/revise.post'
import categoriesGet from '../../server/api/budgets/categories/index.get'
import categoriesPost from '../../server/api/budgets/categories/index.post'
import categoryPatch from '../../server/api/budgets/categories/[id].patch'
import sourcesGet from '../../server/api/budgets/sources.get'

const handle = server({
  'GET /api/budgets/budgets': budgetsGet,
  'POST /api/budgets/budgets': budgetsPost,
  'GET /api/budgets/budgets/new': newGet,
  'GET /api/budgets/budgets/:id': budgetGet,
  'PATCH /api/budgets/budgets/:id': budgetPatch,
  'POST /api/budgets/budgets/:id/propose': proposePost,
  'POST /api/budgets/budgets/:id/approve': approvePost,
  'POST /api/budgets/budgets/:id/send-back': sendBackPost,
  'POST /api/budgets/budgets/:id/close': closePost,
  'POST /api/budgets/budgets/:id/reopen': reopenPost,
  'POST /api/budgets/budgets/:id/lines': linesPost,
  'PUT /api/budgets/budgets/:id/order': orderPut,
  'PATCH /api/budgets/lines/:id': linePatch,
  'POST /api/budgets/lines/:id/revise': revisePost,
  'GET /api/budgets/categories': categoriesGet,
  'POST /api/budgets/categories': categoriesPost,
  'PATCH /api/budgets/categories/:id': categoryPatch,
  'GET /api/budgets/sources': sourcesGet,
})

const NOV_24 = Date.UTC(2026, 10, 24, 12)
const ALL = ['budgets.budget.view', 'budgets.budget.manage', 'budgets.budget.approve', 'budgets.category.manage']
const author = person(ALL, { reassertedAt: NOV_24 })
const treasurer = person(ALL, { reassertedAt: NOV_24 })

type Actor = ReturnType<typeof person>
async function req<T = any>(method: string, path: string, body?: unknown, actor: Actor | null = author): Promise<{ status: number, body: T }> {
  const headers = method === 'POST' ? { 'idempotency-key': newId('req') } : {}
  const response = await call(handle, method, path, { actor: actor ?? undefined, body, headers })
  return { status: response.status, body: await response.json() as T }
}
async function ok<T = any>(method: string, path: string, body?: unknown, actor: Actor = author): Promise<T> {
  const r = await req<T>(method, path, body, actor)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body
}

let n = 0
async function production(firstStartsAt: number | null = Date.UTC(2027, 1, 10, 19)): Promise<string> {
  const id = `prd_budget${++n}`
  await env.DB.prepare("INSERT INTO core_productions (id, slug, title, kind, state, listed, credits_public, interval_count, advisories_confirmed_none, first_starts_at, created_at) VALUES (?, ?, ?, 'own', 'draft', 1, 1, 0, 0, ?, ?)")
    .bind(id, id, `Show ${n}`, firstStartsAt, NOV_24).run()
  return id
}
async function category(slug = 'set'): Promise<string> {
  return (await rows<{ id: string }>('SELECT id FROM budgets_categories WHERE slug = ?', slug))[0]!.id
}
async function general(name = `Budget ${++n}`): Promise<string> {
  return (await ok('POST', '/api/budgets/budgets', { scope: 'general', name })).budgetId
}
async function line(budgetId: string, fields: Record<string, unknown> = {}, actor: Actor = author): Promise<string> {
  return (await ok('POST', `/api/budgets/budgets/${budgetId}/lines`, { name: `Line ${++n}`, kind: 'expense', categoryId: await category(), amountMinor: 10_000, ...fields }, actor)).lineId
}
async function approved(lines: Record<string, unknown>[] = [{}]): Promise<{ budgetId: string, lineIds: string[] }> {
  const budgetId = await general()
  const lineIds: string[] = []
  for (const l of lines) lineIds.push(await line(budgetId, l))
  await ok('POST', `/api/budgets/budgets/${budgetId}/propose`, {})
  await ok('POST', `/api/budgets/budgets/${budgetId}/approve`, {}, treasurer)
  return { budgetId, lineIds }
}
async function view(budgetId: string) {
  return ok('GET', `/api/budgets/budgets/${budgetId}`)
}
/** An expense posted against a line, as a claim or bill will post it. */
async function spend(lineId: string, amount: number, extra: Record<string, unknown> = {}): Promise<void> {
  await inContext(async () => {
    const unit = createUnit()
    await postEntries(unit.view(), {
      key: `budgets:test:${newId('req')}`,
      source: { module: 'budgets', type: 'budgets.line', id: lineId },
      kind: 'transfer',
      purpose: 'expense',
      entries: [
        { account: { key: 'budgets.expenses' }, amountMinor: amount, budgetLineId: lineId, ...extra },
        { account: { key: 'budgets.claims-payable' }, amountMinor: -amount },
      ],
    })
    await unit.commit()
  })
}

beforeAll(async () => {
  setClock(NOV_24)
  for (const id of ['finance', 'payments', 'tickets', 'budgets']) await setModule(id, true)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true })
    await ensureSystemAccounts(unit.view(), 'budgets')
    await ensureSystemAccounts(unit.view(), 'tickets')
    await seed({ payload: { moduleId: 'budgets' } } as any, unit.view())
    await unit.commit()
    await ensureVocabularies('core')
  })
})

describe('categories (BC-03) and accounts (BC-04)', () => {
  it('makes Budgets\' two accounts and seeds the preset categories once', async () => {
    const accounts = await rows<{ system_key: string, kind: string }>("SELECT system_key, kind FROM finance_accounts WHERE module = 'budgets' ORDER BY system_key")
    expect(accounts).toEqual([{ system_key: 'budgets.claims-payable', kind: 'liability' }, { system_key: 'budgets.expenses', kind: 'expense' }])
    await inContext(async () => {
      const unit = createUnit()
      await seed({ payload: { moduleId: 'budgets' } } as any, unit.view())
      await unit.commit()
    })
    const { categories } = await ok('GET', '/api/budgets/categories')
    expect(categories.map((c: { name: string }) => c.name)).toEqual(['Set', 'Costume', 'Lighting', 'Sound', 'Publicity', 'Rights and licences', 'Travel', 'Hospitality', 'Equipment', 'General'])
  })

  it('maps a category only to an expense account given to Budgets, and archives one', async () => {
    const expenses = (await rows<{ id: string }>("SELECT id FROM finance_accounts WHERE system_key = 'budgets.expenses'"))[0]!.id
    const income = (await rows<{ id: string }>("SELECT id FROM finance_accounts WHERE system_key = 'tickets.income'"))[0]!.id
    expect((await req('POST', '/api/budgets/categories', { name: 'Props', accountId: income })).body.code).toBe('budgets.category.account')
    const { categoryId } = await ok('POST', '/api/budgets/categories', { name: 'Props', accountId: expenses })
    expect((await req('POST', '/api/budgets/categories', { name: 'Props' })).body.code).toBe('budgets.category.name-taken')
    await ok('PATCH', `/api/budgets/categories/${categoryId}`, { archived: true })
    const budgetId = await general()
    expect((await req('POST', `/api/budgets/budgets/${budgetId}/lines`, { name: 'Wands', kind: 'expense', categoryId, amountMinor: 100 })).body.code).toBe('budgets.line.category')
  })
})

describe('making a budget (BC-06)', () => {
  it('names a production\'s after it, files it in the finance year of its first night, and allows one open budget', async () => {
    const productionId = await production()
    const { budgetId } = await ok('POST', '/api/budgets/budgets', { scope: 'production', productionId })
    const { budget } = await view(budgetId)
    expect(budget).toMatchObject({ name: `Show ${n}`, scope: 'production', productionId, yearStartsOn: '2026-08-01', state: 'draft', currency: 'GBP' })
    expect((await req('POST', '/api/budgets/budgets', { scope: 'production', productionId })).body.code).toBe('budgets.budget.exists')
    const { productions } = await ok('GET', '/api/budgets/budgets/new')
    expect(productions.map((p: { id: string }) => p.id)).not.toContain(productionId)
  })

  it('needs a department from core\'s departments, and gives it the year', async () => {
    const [technical] = await rows<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'core.department' AND slug = 'technical'")
    expect((await req('POST', '/api/budgets/budgets', { scope: 'department', departmentTermId: 'trm_nope' })).body.code).toBe('budgets.budget.department')
    const { budgetId } = await ok('POST', '/api/budgets/budgets', { scope: 'department', departmentTermId: technical!.id, year: '2027-03-01' })
    expect((await view(budgetId)).budget).toMatchObject({ name: 'Technical 2026', yearStartsOn: '2026-08-01' })
    const next = await ok('POST', '/api/budgets/budgets', { scope: 'department', departmentTermId: technical!.id, year: '2027-09-01' })
    expect((await view(next.budgetId)).budget.yearStartsOn).toBe('2027-08-01')
    expect((await req('POST', '/api/budgets/budgets', { scope: 'department', departmentTermId: technical!.id })).body.code).toBe('budgets.budget.exists')
  })

  it('asks a general budget for its name, and refuses without the ability', async () => {
    expect((await req('POST', '/api/budgets/budgets', { scope: 'general' })).body.code).toBe('budgets.budget.name')
    const nobody = person([])
    expect((await req('POST', '/api/budgets/budgets', { scope: 'general', name: 'X' }, nobody)).status).toBe(403)
    expect((await req('GET', '/api/budgets/budgets', undefined, nobody)).status).toBe(403)
  })
})

describe('lines (BC-07)', () => {
  it('needs a category on spending and ledger income accounts on income, and keeps names unique', async () => {
    const budgetId = await general()
    expect((await req('POST', `/api/budgets/budgets/${budgetId}/lines`, { name: 'Set', kind: 'expense', amountMinor: 100 })).body.code).toBe('budgets.line.category')
    expect((await req('POST', `/api/budgets/budgets/${budgetId}/lines`, { name: 'Tickets', kind: 'income', amountMinor: 100, sources: ['budgets.expenses'] })).body.code).toBe('budgets.line.sources')
    await line(budgetId, { name: 'Set' })
    expect((await req('POST', `/api/budgets/budgets/${budgetId}/lines`, { name: 'Set', kind: 'expense', categoryId: await category(), amountMinor: 1 })).body.code).toBe('budgets.line.name-taken')
    const { sources } = await ok('GET', '/api/budgets/sources')
    expect(sources.map((s: { key: string }) => s.key)).toContain('tickets.income')
  })

  it('changes draft amounts freely, keeping each, and reorders by drag', async () => {
    const budgetId = await general()
    const a = await line(budgetId, { name: 'A', amountMinor: 500 })
    const b = await line(budgetId, { name: 'B', amountMinor: 700 })
    await ok('PATCH', `/api/budgets/lines/${a}`, { amountMinor: 900 })
    await ok('PUT', `/api/budgets/budgets/${budgetId}/order`, { lineIds: [b, a] })
    const { lines, totals } = await view(budgetId)
    expect(lines.map((l: { name: string, draftMinor: number }) => [l.name, l.draftMinor])).toEqual([['B', 700], ['A', 900]])
    expect(totals.budgetedMinor).toBe(1600)
    expect(await rows('SELECT amount_minor FROM budgets_line_amounts WHERE line_id = ? ORDER BY set_at, rowid', a)).toEqual([{ amount_minor: 500 }, { amount_minor: 900 }])
    expect((await req('PUT', `/api/budgets/budgets/${budgetId}/order`, { lineIds: [b, 'bgl_elsewhere'] })).body.code).toBe('budgets.line.unknown')
  })
})

describe('approval (BC-08)', () => {
  it('proposes only with an amount on a line', async () => {
    const budgetId = await general()
    expect((await req('POST', `/api/budgets/budgets/${budgetId}/propose`, {})).body.code).toBe('budgets.budget.empty')
    await line(budgetId, { amountMinor: 0 })
    expect((await req('POST', `/api/budgets/budgets/${budgetId}/propose`, {})).body.code).toBe('budgets.budget.empty')
  })

  it('is never by the proposer; approval copies the draft amounts and is announced', async () => {
    const budgetId = await general()
    const a = await line(budgetId, { amountMinor: 1200 })
    await ok('POST', `/api/budgets/budgets/${budgetId}/propose`, {})
    expect((await req('POST', `/api/budgets/budgets/${budgetId}/approve`, {})).body.code).toBe('budgets.budget.own-proposal')
    expect((await req('POST', `/api/budgets/budgets/${budgetId}/lines`, { name: 'Late', kind: 'expense', categoryId: await category(), amountMinor: 1 })).body.code).toBe('budgets.budget.state')
    await ok('POST', `/api/budgets/budgets/${budgetId}/approve`, {}, treasurer)
    const { budget, lines } = await view(budgetId)
    expect(budget).toMatchObject({ state: 'approved', approvedBy: treasurer.accountId })
    expect(lines[0]).toMatchObject({ id: a, approvedMinor: 1200, figures: { budgetedMinor: 1200 } })
    expect(await rows('SELECT name FROM core_events WHERE record_id = ?', budgetId)).toEqual([{ name: 'budgets.budget.approved' }])
    expect((await req('POST', `/api/budgets/budgets/${budgetId}/approve`, {}, treasurer)).body.code).toBe('budgets.budget.state')
  })

  it('sends a proposal back with a note, as a draft again', async () => {
    const budgetId = await general()
    await line(budgetId)
    await ok('POST', `/api/budgets/budgets/${budgetId}/propose`, {})
    expect((await req('POST', `/api/budgets/budgets/${budgetId}/send-back`, { note: '' }, treasurer)).status).toBe(422)
    await ok('POST', `/api/budgets/budgets/${budgetId}/send-back`, { note: 'Too much on set' }, treasurer)
    expect((await view(budgetId)).budget).toMatchObject({ state: 'draft', note: 'Too much on set' })
  })
})

describe('figures (BC-10)', () => {
  it('spent equals Finance\'s sum of tagged entries, to the penny', async () => {
    const { budgetId, lineIds: [a, b] } = await approved([{ amountMinor: 50_000 }, { amountMinor: 20_000 }])
    await spend(a!, 12_345)
    await spend(a!, 1)
    await spend(b!, 9_999)
    const { lines, totals } = await view(budgetId)
    const ledger = await inContext(() => balances({ budgetLineIds: [a!] }))
    const debits = ledger.reduce((s, r) => s + r.debitsMinor - r.creditsMinor, 0)
    expect(lines.find((l: { id: string }) => l.id === a).figures).toEqual({ budgetedMinor: 50_000, committedMinor: 0, pendingMinor: 0, actualMinor: debits, remainingMinor: 50_000 - debits, over: false })
    expect(debits).toBe(12_346)
    expect(totals).toMatchObject({ budgetedMinor: 70_000, actualMinor: 22_345, remainingMinor: 47_655 })
  })

  it('marks a line over budget when spending passes it', async () => {
    const { budgetId, lineIds: [a] } = await approved([{ amountMinor: 1_000 }])
    await spend(a!, 1_500)
    const { lines } = await view(budgetId)
    expect(lines[0].figures).toMatchObject({ remainingMinor: -500, over: true })
  })

  it('counts a production\'s ticket income on an income line that reads it', async () => {
    const productionId = await production()
    const { budgetId } = await ok('POST', '/api/budgets/budgets', { scope: 'production', productionId })
    const tickets = await line(budgetId, { name: 'Tickets', kind: 'income', categoryId: null, amountMinor: 80_000, sources: ['tickets.income'] })
    await inContext(async () => {
      const unit = createUnit()
      for (const [pid, amount] of [[productionId, 3_000], [null, 999]] as const) {
        await postEntries(unit.view(), {
          key: `tickets:test:${newId('req')}`,
          source: { module: 'tickets', type: 'tickets.order', id: newId('req') },
          kind: 'transfer',
          entries: [{ account: { key: 'tickets.cash' }, amountMinor: amount }, { account: { key: 'tickets.income' }, amountMinor: -amount, productionId: pid }],
        })
      }
      await unit.commit()
    })
    const { lines, totals } = await view(budgetId)
    expect(lines.find((l: { id: string }) => l.id === tickets).figures).toMatchObject({ budgetedMinor: 80_000, actualMinor: 3_000, remainingMinor: 77_000 })
    expect(totals).toMatchObject({ incomeBudgetedMinor: 80_000, incomeActualMinor: 3_000, budgetedMinor: 0 })
  })
})

describe('budgets funded from a line (BC-12)', () => {
  it('counts a sub-budget\'s approved total as committed on its parent line, once approved', async () => {
    const { budgetId: season, lineIds: [productions] } = await approved([{ name: 'Productions', amountMinor: 100_000 }])
    const productionId = await production()
    const { budgetId } = await ok('POST', '/api/budgets/budgets', { scope: 'production', productionId, parentLineId: productions })
    await line(budgetId, { amountMinor: 30_000 })
    await line(budgetId, { kind: 'income', categoryId: null, amountMinor: 50_000 })
    expect((await view(season)).lines[0].figures.committedMinor).toBe(0)
    await ok('POST', `/api/budgets/budgets/${budgetId}/propose`, {})
    await ok('POST', `/api/budgets/budgets/${budgetId}/approve`, {}, treasurer)
    const parent = await view(season)
    expect(parent.lines[0].figures).toMatchObject({ budgetedMinor: 100_000, committedMinor: 30_000, remainingMinor: 70_000 })
    expect(parent.subBudgets).toMatchObject([{ id: budgetId, totalMinor: 30_000 }])
    expect((await view(budgetId)).parent).toMatchObject({ lineId: productions, budgetId: season })
  })

  it('refuses a loop', async () => {
    const { budgetId: top, lineIds: [topLine] } = await approved()
    const { budgetId: child } = await ok('POST', '/api/budgets/budgets', { scope: 'general', name: `Child ${++n}`, parentLineId: topLine })
    const childLine = await line(child)
    expect((await req('PATCH', `/api/budgets/budgets/${top}`, { parentLineId: childLine })).body.code).toBe('budgets.budget.state')
    const draft = await general()
    const draftLine = await line(draft)
    await ok('PATCH', `/api/budgets/budgets/${child}`, { parentLineId: draftLine })
    const grandchild = await ok('POST', '/api/budgets/budgets', { scope: 'general', name: `Grandchild ${++n}`, parentLineId: childLine })
    const grandchildLine = await line(grandchild.budgetId)
    expect((await req('PATCH', `/api/budgets/budgets/${draft}`, { parentLineId: grandchildLine })).body.code).toBe('budgets.budget.parent-line')
  })
})

describe('revising (BC-09)', () => {
  it('adds an approved amount with a reason, and below spent plus committed asks to confirm', async () => {
    const { budgetId, lineIds: [a] } = await approved([{ amountMinor: 10_000 }])
    await spend(a!, 6_000)
    await ok('POST', `/api/budgets/lines/${a}/revise`, { amountMinor: 12_000, reason: 'Extra flats' }, treasurer)
    const below = await req('POST', `/api/budgets/lines/${a}/revise`, { amountMinor: 5_000, reason: 'Cut' }, treasurer)
    expect(below.body).toMatchObject({ code: 'budgets.line.below-spent', detail: { floorMinor: '6000' } })
    await ok('POST', `/api/budgets/lines/${a}/revise`, { amountMinor: 5_000, reason: 'Cut', confirm: true }, treasurer)
    const { lines, history } = await view(budgetId)
    expect(lines[0].figures).toMatchObject({ budgetedMinor: 5_000, actualMinor: 6_000, over: true })
    expect(history.map((h: { amountMinor: number, reason: string | null }) => [h.amountMinor, h.reason])).toEqual([[10_000, null], [12_000, 'Extra flats'], [5_000, 'Cut']])
    expect((await req('POST', `/api/budgets/lines/${a}/revise`, { amountMinor: 1, reason: 'x' }, person(['budgets.budget.view', 'budgets.budget.manage']))).status).toBe(403)
  })

  it('adds a line to an approved budget only with the approver and a reason, and keeps a line with spending', async () => {
    const { budgetId, lineIds: [a] } = await approved()
    const manager = person(['budgets.budget.view', 'budgets.budget.manage'])
    expect((await req('POST', `/api/budgets/budgets/${budgetId}/lines`, { name: 'Extra', kind: 'expense', categoryId: await category(), amountMinor: 1 }, manager)).status).toBe(403)
    expect((await req('POST', `/api/budgets/budgets/${budgetId}/lines`, { name: 'Extra', kind: 'expense', categoryId: await category(), amountMinor: 1 }, treasurer)).body.code).toBe('budgets.line.reason')
    const extra = await line(budgetId, { name: 'Extra', amountMinor: 2_500, reason: 'Hire van' }, treasurer)
    expect((await view(budgetId)).lines.find((l: { id: string }) => l.id === extra)).toMatchObject({ approvedMinor: 2_500 })
    await spend(a!, 1)
    expect((await req('PATCH', `/api/budgets/lines/${a}`, { archived: true }, treasurer)).body.code).toBe('budgets.line.in-use')
    expect((await req('PATCH', `/api/budgets/lines/${a}`, { amountMinor: 5 }, treasurer)).body.code).toBe('budgets.line.approved')
    await ok('PATCH', `/api/budgets/lines/${extra}`, { archived: true }, treasurer)
  })
})

describe('closing (BC-13)', () => {
  it('closes and reopens with a reason, unless another budget took its place', async () => {
    const productionId = await production()
    const { budgetId } = await ok('POST', '/api/budgets/budgets', { scope: 'production', productionId })
    await line(budgetId)
    await ok('POST', `/api/budgets/budgets/${budgetId}/propose`, {})
    await ok('POST', `/api/budgets/budgets/${budgetId}/approve`, {}, treasurer)
    await ok('POST', `/api/budgets/budgets/${budgetId}/close`, {}, treasurer)
    expect((await view(budgetId)).budget.state).toBe('closed')
    await ok('POST', `/api/budgets/budgets/${budgetId}/reopen`, { note: 'Late bill from the hire company' }, treasurer)
    expect((await view(budgetId)).budget).toMatchObject({ state: 'approved', note: 'Late bill from the hire company' })
    await ok('POST', `/api/budgets/budgets/${budgetId}/close`, {}, treasurer)
    await ok('POST', '/api/budgets/budgets', { scope: 'production', productionId })
    expect((await req('POST', `/api/budgets/budgets/${budgetId}/reopen`, { note: 'Again' }, treasurer)).body.code).toBe('budgets.budget.taken')
  })

  it('lists a year\'s budgets with their totals, closed ones last', async () => {
    const { budgets, year } = await ok('GET', '/api/budgets/budgets', undefined)
    expect(year).toBe('2026-08-01')
    expect(budgets.length).toBeGreaterThan(3)
    const states = budgets.map((b: { state: string }) => b.state)
    expect(states.indexOf('closed')).toBeGreaterThan(states.lastIndexOf('approved'))
  })
})
