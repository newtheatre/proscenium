// Lending and the loan page (INV-19, INV-21; L3, L4, L7, L16, L17): lending straight from a department
// approves and promises in one unit, a clash names the item, a request is approved all or none or
// declined, lines come off, and only those who may see a department's loans see them.
import { beforeAll, describe, expect, it } from 'vitest'
import { newId } from '#kit'
import { call, person, rows, server } from '../../../../tests/integration/helpers'
import listLoans from '../../server/api/inventory/loans/index.get'
import lendRoute from '../../server/api/inventory/loans/index.post'
import readLoan from '../../server/api/inventory/loans/[id]/index.get'
import approve from '../../server/api/inventory/loans/[id]/approve.post'
import decline from '../../server/api/inventory/loans/[id]/decline.post'
import cancel from '../../server/api/inventory/loans/[id]/cancel.post'
import addLineRoute from '../../server/api/inventory/loans/[id]/lines/index.post'
import removeLineRoute from '../../server/api/inventory/loans/[id]/lines/[lineId].delete'
import { day, item, ready, request, shelf, type Shelf } from './stage'

const app = server({
  'GET /api/inventory/loans': listLoans,
  'POST /api/inventory/loans': lendRoute,
  'GET /api/inventory/loans/:id': readLoan,
  'POST /api/inventory/loans/:id/approve': approve,
  'POST /api/inventory/loans/:id/decline': decline,
  'POST /api/inventory/loans/:id/cancel': cancel,
  'POST /api/inventory/loans/:id/lines': addLineRoute,
  'DELETE /api/inventory/loans/:id/lines/:lineId': removeLineRoute,
})

const lead = person(['inventory.loan.approve'])
async function req<T = any>(method: string, path: string, body?: unknown, actor = lead): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}
const code = (r: { body: any }) => r.body?.code ?? r.body?.data?.code
const detailOf = (r: { body: any }) => r.body?.detail ?? r.body?.data?.detail
const ok = (r: { status: number, body: any }) => {
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body
}
const lendTo = (s: Shelf, itemIds: string[], fields: Record<string, unknown> = {}) => ({
  departmentId: s.departmentId, kind: 'outside', borrowerName: 'Albany Players', borrowerEmail: 'props@albany.example', purpose: 'Panto',
  startsOn: day(1), dueBackOn: day(5), itemIds, ...fields,
})
const states = async (loanId: string) => rows<{ item_id: string, state: string }>('SELECT item_id, state FROM inventory_loan_lines WHERE loan_id = ? ORDER BY sort', loanId)

beforeAll(ready)

describe('lending straight from a department (INV-21, L3, L4)', () => {
  it('approves and promises every item in one unit', async () => {
    const s = await shelf()
    const [a, b] = [await item(s), await item(s)]
    const { loanId } = ok(await req('POST', '/api/inventory/loans', lendTo(s, [a, b])))
    expect((await rows('SELECT state, kind, borrower_name FROM inventory_loans WHERE id = ?', loanId))[0]).toEqual({ state: 'approved', kind: 'outside', borrower_name: 'Albany Players' })
    expect(await states(loanId)).toEqual([{ item_id: a, state: 'promised' }, { item_id: b, state: 'promised' }])
  })

  it('refuses an item promised elsewhere then, naming it, and writes nothing', async () => {
    const s = await shelf()
    const a = await item(s)
    ok(await req('POST', '/api/inventory/loans', lendTo(s, [a])))
    const before = (await rows('SELECT count(*) AS n FROM inventory_loans WHERE department_id = ?', s.departmentId))[0]
    const clash = await req('POST', '/api/inventory/loans', lendTo(s, [a], { startsOn: day(3), dueBackOn: day(8) }))
    expect(clash.status).toBe(409)
    expect(code(clash)).toBe('inventory.loan.clash')
    expect(Object.keys(detailOf(clash))).toEqual([a])
    expect((await rows('SELECT count(*) AS n FROM inventory_loans WHERE department_id = ?', s.departmentId))[0]).toEqual(before)
  })

  it('refuses a department that does not lend outside, a loan past the longest, and someone who may not approve', async () => {
    const members = await shelf('members')
    expect(code(await req('POST', '/api/inventory/loans', lendTo(members, [await item(members)])))).toBe('inventory.loan.not-lent')
    const s = await shelf()
    expect(code(await req('POST', '/api/inventory/loans', lendTo(s, [], { dueBackOn: day(400) })))).toBe('inventory.loan.too-long')
    expect((await req('POST', '/api/inventory/loans', lendTo(s, []), person(['inventory.loan.view']))).status).toBe(403)
  })
})

describe('deciding a request (INV-19, L7, L17)', () => {
  it('approves all or none, naming the line in the way, and approves once that line is off', async () => {
    const s = await shelf()
    const [a, b] = [await item(s), await item(s)]
    ok(await req('POST', '/api/inventory/loans', lendTo(s, [b])))
    const loan = await request(s, 2, 4, [{ itemId: a }, { itemId: b }])
    const refused = await req('POST', `/api/inventory/loans/${loan.id}/approve`, {})
    expect(code(refused)).toBe('inventory.loan.clash')
    const lines = ok(await req('GET', `/api/inventory/loans/${loan.id}`)).loan.lineList
    expect(lines.map((l: any) => [l.itemId, l.free])).toEqual([[a, { free: true }], [b, { free: false, reason: 'taken' }]])
    ok(await req('DELETE', `/api/inventory/loans/${loan.id}/lines/${lines[1].id}`))
    ok(await req('POST', `/api/inventory/loans/${loan.id}/approve`, {}))
    expect(await states(loan.id)).toEqual([{ item_id: a, state: 'promised' }, { item_id: b, state: 'cancelled' }])
  })

  it('declines with a note, releasing every line, and a declined loan cannot be cancelled', async () => {
    const s = await shelf()
    const loan = await request(s, 2, 4, [{ itemId: await item(s) }])
    ok(await req('POST', `/api/inventory/loans/${loan.id}/decline`, { note: 'Needed for our own show' }))
    expect((await rows('SELECT state, decline_note FROM inventory_loans WHERE id = ?', loan.id))[0]).toEqual({ state: 'declined', decline_note: 'Needed for our own show' })
    expect((await states(loan.id)).map(l => l.state)).toEqual(['cancelled'])
    expect((await req('POST', `/api/inventory/loans/${loan.id}/cancel`, {})).status).toBe(409)
  })

  it('adds a wanted line in words and an item of the department, and refuses another department\'s item', async () => {
    const s = await shelf()
    const loan = await request(s, 2, 4, [])
    ok(await req('POST', `/api/inventory/loans/${loan.id}/lines`, { wanted: 'Victorian teapot' }))
    ok(await req('POST', `/api/inventory/loans/${loan.id}/lines`, { itemId: await item(s) }))
    const other = await shelf()
    expect(code(await req('POST', `/api/inventory/loans/${loan.id}/lines`, { itemId: await item(other) }))).toBe('inventory.line.wrong-item')
    expect((await states(loan.id)).map(l => l.state)).toEqual(['wanted', 'listed'])
  })
})

describe('who sees loans (S4, S5)', () => {
  it('lists only the departments a person holds loan.view on, and shows the borrower', async () => {
    const mine = await shelf()
    const theirs = await shelf()
    const { loanId } = ok(await req('POST', '/api/inventory/loans', lendTo(mine, [await item(mine)])))
    ok(await req('POST', '/api/inventory/loans', lendTo(theirs, [await item(theirs)])))
    const viewer = person([], { grants: [{ ability: 'inventory.loan.view', via: 'role', record: { type: 'inventory.department', id: mine.departmentId } }] } as any)
    const list = ok(await req('GET', '/api/inventory/loans', undefined, viewer))
    expect(list.loans.map((l: any) => l.id)).toEqual([loanId])
    expect(list.loans[0]).toMatchObject({ borrower: 'Albany Players', state: 'approved', lines: 1 })
    expect(list.lending).toEqual([])
    const seen = ok(await req('GET', `/api/inventory/loans/${loanId}`, undefined, viewer)).loan
    expect(seen.can).toEqual({ approve: false, edit: false, cancel: false })
    expect((await req('GET', '/api/inventory/loans', undefined, person([]))).status).toBe(403)
  })
})
