// A production's pull lists (INV-17, INV-18; L2, L5, L6, L9, S15): started from the Kit tab, due back
// after the last performance, gathered in words and matched, submitted, approved all or none, and a
// match after approval is a promise.
import { beforeAll, describe, expect, it } from 'vitest'
import { newId } from '#kit'
import { call, env, person, rows, server } from '../../../../tests/integration/helpers'
import createVenue from '../../../core/server/api/core/venues/index.post'
import startRoute from '../../server/api/inventory/pull-lists/index.post'
import kitRoute from '../../server/api/inventory/productions/[id]/kit.get'
import listLoans from '../../server/api/inventory/loans/index.get'
import readLoan from '../../server/api/inventory/loans/[id]/index.get'
import approve from '../../server/api/inventory/loans/[id]/approve.post'
import submit from '../../server/api/inventory/loans/[id]/submit.post'
import cancel from '../../server/api/inventory/loans/[id]/cancel.post'
import candidates from '../../server/api/inventory/loans/[id]/candidates.get'
import addLineRoute from '../../server/api/inventory/loans/[id]/lines/index.post'
import matchRoute from '../../server/api/inventory/loans/[id]/lines/[lineId]/match.post'
import { at, day, item, ready, request, shelf, type Shelf } from './stage'

const app = server({
  'POST /api/core/venues': createVenue,
  'POST /api/inventory/pull-lists': startRoute,
  'GET /api/inventory/productions/:id/kit': kitRoute,
  'GET /api/inventory/loans': listLoans,
  'GET /api/inventory/loans/:id': readLoan,
  'POST /api/inventory/loans/:id/approve': approve,
  'POST /api/inventory/loans/:id/submit': submit,
  'POST /api/inventory/loans/:id/cancel': cancel,
  'GET /api/inventory/loans/:id/candidates': candidates,
  'POST /api/inventory/loans/:id/lines': addLineRoute,
  'POST /api/inventory/loans/:id/lines/:lineId/match': matchRoute,
})

const lead = person(['inventory.loan.approve'])
let venueId = ''
let spaceId = ''

async function req<T = any>(method: string, path: string, body?: unknown, actor = lead): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}
const code = (r: { body: any }) => r.body?.code ?? r.body?.data?.code
const ok = (r: { status: number, body: any }) => {
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body
}
const states = async (loanId: string) => (await rows<{ state: string }>('SELECT state FROM inventory_loan_lines WHERE loan_id = ? ORDER BY sort, created_at, id', loanId)).map(r => r.state)

/** A production with a performance on each of these days (offsets from 12 January 2027). */
async function production(days: number[], state = 'draft'): Promise<string> {
  const id = newId('prd')
  await env.DB.prepare('INSERT INTO core_productions (id, slug, title, kind, state, listed, credits_public, interval_count, advisories_confirmed_none, created_at) VALUES (?, ?, \'The Seagull\', \'own\', ?, 1, 1, 0, 0, 0)').bind(id, id, state).run()
  for (const d of days) {
    await env.DB.prepare('INSERT INTO core_performances (id, production_id, venue_id, space_id, starts_at, ends_at, operating_day, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, \'scheduled\', 0)')
      .bind(newId('perf'), id, venueId, spaceId, at(d, 19), at(d, 22), day(d)).run()
  }
  return id
}
const editor = (productionId: string) => person([], { grants: [{ ability: 'inventory.pull-list.edit', via: 'role', record: { type: 'core.production', id: productionId } }] } as any)
const start = (s: Shelf, productionId: string, actor = editor(productionId), fields: Record<string, unknown> = {}) =>
  req('POST', '/api/inventory/pull-lists', { productionId, departmentId: s.departmentId, startsOn: day(1), ...fields }, actor)

beforeAll(async () => {
  await ready()
  const made = ok(await req('POST', '/api/core/venues', { name: 'Kit venue' }, person(['core.venue.manage'])))
  venueId = made.venueId
  spaceId = made.spaceId
})

describe('starting a pull list (INV-17, L2, L5, L9)', () => {
  it('starts a draft due back after the last performance and its grace, one per department', async () => {
    const s = await shelf('productions')
    const prd = await production([8, 9, 10])
    const sm = editor(prd)
    const { loanId } = ok(await start(s, prd, sm))
    expect((await rows('SELECT state, kind, production_id, due_back_on, due_back_set, responsible_account_id FROM inventory_loans WHERE id = ?', loanId))[0])
      .toEqual({ state: 'draft', kind: 'production', production_id: prd, due_back_on: day(17), due_back_set: 'from-production', responsible_account_id: sm.accountId })
    expect(code(await start(s, prd, sm))).toBe('inventory.pull-list.exists')
    const kit = ok(await req('GET', `/api/inventory/productions/${prd}/kit`, undefined, sm))
    expect(kit.lists.map((l: any) => [l.id, l.state])).toEqual([[loanId, 'draft']])
    expect(kit.startable.map((d: any) => d.id)).not.toContain(s.departmentId)
    expect(kit.dueBackOn).toBe(day(17))
  })

  it('asks for a date when there are no performances, and refuses someone without the production', async () => {
    const s = await shelf()
    const prd = await production([])
    expect(code(await start(s, prd))).toBe('inventory.pull-list.no-dates')
    ok(await start(s, prd, editor(prd), { dueBackOn: day(20) }))
    expect((await start(await shelf(), prd, editor(await production([5])))).status).toBe(403)
  })
})

describe('gathering, matching and submitting (INV-18, L5, L6)', () => {
  it('lets the production add wanted lines and match them while a draft, then submit; the department sees the draft', async () => {
    const s = await shelf()
    const prd = await production([10])
    const sm = editor(prd)
    const { loanId } = ok(await start(s, prd, sm))
    const teapot = await item(s, {})
    const { lineId } = ok(await req('POST', `/api/inventory/loans/${loanId}/lines`, { wanted: 'Victorian teapot' }, sm))
    const found = ok(await req('GET', `/api/inventory/loans/${loanId}/candidates?q=Item`, undefined, sm)).items
    expect(found.find((c: any) => c.id === teapot)).toMatchObject({ free: true })
    ok(await req('POST', `/api/inventory/loans/${loanId}/lines/${lineId}/match`, { itemId: teapot }, sm))
    expect(code(await req('POST', `/api/inventory/loans/${loanId}/lines/${lineId}/match`, { itemId: teapot }, sm))).toBe('inventory.line.not-wanted')
    expect(code(await req('POST', `/api/inventory/loans/${loanId}/lines`, { itemId: await item(await shelf()) }, sm))).toBe('inventory.line.wrong-item')
    ok(await req('POST', `/api/inventory/loans/${loanId}/lines`, { wanted: 'A samovar' }, sm))
    const seen = ok(await req('GET', `/api/inventory/loans/${loanId}`, undefined, sm)).loan
    expect(seen.can).toEqual({ approve: false, edit: true, cancel: true, submit: true })
    const viewer = person([], { grants: [{ ability: 'inventory.loan.view', via: 'role', record: { type: 'inventory.department', id: s.departmentId } }] } as any)
    expect(ok(await req('GET', '/api/inventory/loans', undefined, viewer)).loans.map((l: any) => [l.id, l.state])).toEqual([[loanId, 'draft']])
    ok(await req('POST', `/api/inventory/loans/${loanId}/submit`, {}, sm))
    expect((await rows('SELECT state FROM inventory_loans WHERE id = ?', loanId))[0]).toEqual({ state: 'requested' })
    expect((await req('POST', `/api/inventory/loans/${loanId}/lines`, { wanted: 'Too late' }, sm)).status).toBe(403)
    expect((await req('POST', `/api/inventory/loans/${loanId}/cancel`, {}, sm)).status).toBe(403)
  })

  it('approves listed lines all or none, leaves wanted lines wanted, and a match after approval promises or refuses', async () => {
    const s = await shelf()
    const prd = await production([10])
    const sm = editor(prd)
    const { loanId } = ok(await start(s, prd, sm))
    const [chair, lamp] = [await item(s), await item(s)]
    ok(await req('POST', `/api/inventory/loans/${loanId}/lines`, { itemId: chair }, sm))
    const { lineId } = ok(await req('POST', `/api/inventory/loans/${loanId}/lines`, { wanted: 'A standard lamp' }, sm))
    ok(await req('POST', `/api/inventory/loans/${loanId}/submit`, {}, sm))
    ok(await req('POST', `/api/inventory/loans/${loanId}/approve`, {}))
    expect(await states(loanId)).toEqual(['promised', 'wanted'])
    await request(s, 3, 6, [{ itemId: lamp }]).then(other => req('POST', `/api/inventory/loans/${other.id}/approve`, {}))
    expect(code(await req('POST', `/api/inventory/loans/${loanId}/lines/${lineId}/match`, { itemId: lamp }))).toBe('inventory.loan.clash')
    expect(await states(loanId)).toEqual(['promised', 'wanted'])
    ok(await req('POST', `/api/inventory/loans/${loanId}/lines/${lineId}/match`, { itemId: await item(s) }))
    expect(await states(loanId)).toEqual(['promised', 'promised'])
    const kit = ok(await req('GET', `/api/inventory/productions/${prd}/kit`, undefined, sm)).lists[0]
    expect(kit).toMatchObject({ state: 'approved', wanted: 0, promised: 2, out: 0 })
  })

  it('lets the production cancel its own draft, and shows a department\'s people only their lists', async () => {
    const [props, costume] = [await shelf(), await shelf()]
    const prd = await production([10])
    const sm = editor(prd)
    const first = ok(await start(props, prd, sm)).loanId
    ok(await start(costume, prd, sm))
    const viewer = person([], { grants: [{ ability: 'inventory.loan.view', via: 'role', record: { type: 'inventory.department', id: costume.departmentId } }] } as any)
    const kit = ok(await req('GET', `/api/inventory/productions/${prd}/kit`, undefined, viewer))
    expect(kit.lists.map((l: any) => l.departmentId)).toEqual([costume.departmentId])
    expect(kit).toMatchObject({ canStart: false, startable: [] })
    expect((await req('GET', `/api/inventory/productions/${prd}/kit`, undefined, person([]))).status).toBe(403)
    ok(await req('POST', `/api/inventory/loans/${first}/cancel`, {}, sm))
    expect((await rows('SELECT state, cancel_reason FROM inventory_loans WHERE id = ?', first))[0]).toEqual({ state: 'cancelled', cancel_reason: 'by-borrower' })
    ok(await start(props, prd, sm))
  })
})
