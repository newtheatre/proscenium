// The kit desk (INV-22, INV-23; L11 to L15, K2 to K5): a scan opens the loan, check-out records the
// condition and who collects with training checked then, and returns may be partial, lost or damaged.
import { beforeAll, describe, expect, it } from 'vitest'
import { newId } from '#kit'
import { call, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import lendRoute from '../../server/api/inventory/loans/index.post'
import scan from '../../server/api/inventory/desk/scan.get'
import readDesk from '../../server/api/inventory/desk/loans/[id]/index.get'
import checkOutRoute from '../../server/api/inventory/desk/loans/[id]/check-out.post'
import returnRoute from '../../server/api/inventory/desk/loans/[id]/return.post'
import { day, item, ready, shelf, type Shelf } from './stage'

const app = server({
  'POST /api/inventory/loans': lendRoute,
  'GET /api/inventory/desk/scan': scan,
  'GET /api/inventory/desk/loans/:id': readDesk,
  'POST /api/inventory/desk/loans/:id/check-out': checkOutRoute,
  'POST /api/inventory/desk/loans/:id/return': returnRoute,
})

const desk = person(['inventory.loan.approve', 'inventory.loan.issue'])
const TODAY = '2026-11-24'
const NEED = 'fact:front-of-house.on-shift'

async function req<T = any>(method: string, path: string, body?: unknown, actor = desk): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}
const code = (r: { body: any }) => r.body?.code ?? r.body?.data?.code
const detailOf = (r: { body: any }) => r.body?.detail ?? r.body?.data?.detail
const ok = (r: { status: number, body: any }) => {
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body
}
const lend = async (s: Shelf, itemIds: string[], startsOn = TODAY) => ok(await req('POST', '/api/inventory/loans', {
  departmentId: s.departmentId, kind: 'outside', borrowerName: 'Albany Players', borrowerEmail: 'props@albany.example', startsOn, dueBackOn: day(5), itemIds,
})).loanId as string
const lines = (loanId: string) => rows<{ id: string, item_id: string, state: string, out_condition: string | null, returned_quantity: number | null, fault_id: string | null, requirement_overridden_by: string | null }>(
  'SELECT id, item_id, state, out_condition, returned_quantity, fault_id, requirement_overridden_by FROM inventory_loan_lines WHERE loan_id = ? ORDER BY sort, created_at', loanId)
const loanState = async (loanId: string) => (await rows<{ state: string }>('SELECT state FROM inventory_loans WHERE id = ?', loanId))[0]!.state
const outAll = async (loanId: string, extra: Record<string, unknown> = {}, actor = desk) =>
  req('POST', `/api/inventory/desk/loans/${loanId}/check-out`, { lines: (await lines(loanId)).map(l => ({ lineId: l.id, condition: 'good' })), ...extra }, actor)

beforeAll(async () => {
  await ready()
  await setModule('front-of-house', true)
})

describe('checking out (INV-22, L11, K2 to K5)', () => {
  it('opens the loan by tag, checks every line out with its condition, and makes the loan Out', async () => {
    const s = await shelf()
    const [a, b] = [await item(s), await item(s)]
    const loanId = await lend(s, [a, b])
    const [tag] = await rows<{ tag: string }>('SELECT tag FROM inventory_items WHERE id = ?', a)
    expect(ok(await req('GET', `/api/inventory/desk/scan?code=${encodeURIComponent(tag!.tag)}`)).loanId).toBe(loanId)
    expect(ok(await req('GET', `/api/inventory/desk/scan?code=${encodeURIComponent(`https://example.org/console/inventory/items/${b}`)}`)).loanId).toBe(loanId)
    const [first, second] = await lines(loanId)
    ok(await req('POST', `/api/inventory/desk/loans/${loanId}/check-out`, { lines: [{ lineId: first!.id, condition: 'worn' }] }))
    expect(await loanState(loanId)).toBe('out')
    ok(await req('POST', `/api/inventory/desk/loans/${loanId}/check-out`, { lines: [{ lineId: second!.id, condition: 'good' }] }))
    expect((await lines(loanId)).map(l => [l.state, l.out_condition])).toEqual([['out', 'worn'], ['out', 'good']])
    expect((await rows('SELECT condition FROM inventory_items WHERE id = ?', a))[0]).toEqual({ condition: 'worn' })
    expect((await rows('SELECT count(*) AS n FROM inventory_item_events WHERE loan_id = ? AND kind = \'checked-out\'', loanId))[0]).toEqual({ n: 2 })
    expect(code(await req('POST', `/api/inventory/desk/loans/${loanId}/check-out`, { lines: [{ lineId: first!.id, condition: 'good' }] }))).toBe('inventory.desk.not-on-loan')
  })

  it('refuses before the start day, an item out of service, and someone who does not work the desk', async () => {
    const s = await shelf()
    expect(code(await outAll(await lend(s, [await item(s)], day(2))))).toBe('inventory.desk.too-early')
    const broken = await item(s)
    const loanId = await lend(s, [broken])
    await rows('UPDATE inventory_items SET state = \'out-of-service\', out_of_service_reason = \'by-hand\' WHERE id = ?', broken)
    expect(code(await outAll(loanId))).toBe('inventory.desk.not-usable')
    expect((await outAll(loanId, {}, person(['inventory.loan.view']))).status).toBe(403)
  })

  it('checks what the kit needs of whoever collects, and lets it go only with a named override', async () => {
    const s = await shelf()
    const hazer = await item(s)
    await rows('UPDATE inventory_categories SET requirements = json_array(?) WHERE id = ?', NEED, s.categoryId)
    const loanId = await lend(s, [hazer])
    const collector = newId('acc')
    const read = ok(await req('GET', `/api/inventory/desk/loans/${loanId}?collector=${collector}`)).loan
    expect(read.lines[0].needs).toEqual([{ ref: NEED, label: 'front-of-house.facts.on-shift.label', met: false, checked: true }])
    const refused = await outAll(loanId, { collectorAccountId: collector })
    expect(code(refused)).toBe('inventory.requirement.not-met')
    expect(detailOf(refused)).toEqual({ [read.lines[0].id]: NEED })
    expect((await outAll(loanId, { collectorAccountId: collector, overrideReason: 'trained-elsewhere' })).status).toBe(403)
    const overrider = person(['inventory.loan.issue', 'inventory.requirement.override'])
    ok(await outAll(loanId, { collectorAccountId: collector, overrideReason: 'trained-elsewhere' }, overrider))
    expect((await lines(loanId))[0]!.requirement_overridden_by).toBe(overrider.accountId)
    expect((await rows('SELECT responsible_account_id FROM inventory_loans WHERE id = ?', loanId))[0]).toEqual({ responsible_account_id: collector })
  })
})

describe('returning (INV-23, L13 to L15)', () => {
  it('takes a counted line back in parts and returns the loan when nothing is left out', async () => {
    const s = await shelf()
    const chairs = await item(s, { quantity: 10 })
    const loanId = ok(await req('POST', '/api/inventory/loans', { departmentId: s.departmentId, kind: 'outside', borrowerName: 'Albany Players', borrowerEmail: 'props@albany.example', startsOn: TODAY, dueBackOn: day(5), itemIds: [] })).loanId
    await rows('INSERT INTO inventory_loan_lines (id, loan_id, item_id, quantity, state, created_at, updated_at) VALUES (?, ?, ?, 6, \'promised\', 0, 0)', newId('kll'), loanId, chairs)
    ok(await outAll(loanId))
    const [line] = await lines(loanId)
    ok(await req('POST', `/api/inventory/desk/loans/${loanId}/return`, { lines: [{ lineId: line!.id, condition: 'good', quantity: 4 }] }))
    expect((await lines(loanId))[0]).toMatchObject({ state: 'out', returned_quantity: 4 })
    expect(await loanState(loanId)).toBe('out')
    expect(code(await req('POST', `/api/inventory/desk/loans/${loanId}/return`, { lines: [{ lineId: line!.id, condition: 'good', quantity: 3 }] }))).toBe('inventory.desk.too-many')
    ok(await req('POST', `/api/inventory/desk/loans/${loanId}/return`, { lines: [{ lineId: line!.id, condition: 'good', quantity: 2 }] }))
    expect((await lines(loanId))[0]).toMatchObject({ state: 'returned', returned_quantity: 6 })
    expect(await loanState(loanId)).toBe('returned')
  })

  it('opens a fault for damage, taking the item out of service, and marks a lost item missing', async () => {
    const s = await shelf()
    const [lamp, cane] = [await item(s), await item(s)]
    const loanId = await lend(s, [lamp, cane])
    ok(await outAll(loanId))
    const [l1, l2] = await lines(loanId)
    expect(code(await req('POST', `/api/inventory/desk/loans/${loanId}/return`, { lines: [{ lineId: l1!.id, condition: 'damaged' }] }))).toBe('core.input.invalid')
    ok(await req('POST', `/api/inventory/desk/loans/${loanId}/return`, { lines: [
      { lineId: l1!.id, condition: 'damaged', fault: 'Shade cracked' },
      { lineId: l2!.id, condition: 'good', lost: true },
    ] }))
    const after = await lines(loanId)
    expect(after.map(l => l.state)).toEqual(['returned', 'lost'])
    expect((await rows('SELECT state, source, description, loan_id FROM inventory_faults WHERE id = ?', after[0]!.fault_id))[0]).toEqual({ state: 'open', source: 'return', description: 'Shade cracked', loan_id: loanId })
    expect((await rows('SELECT id, state, condition FROM inventory_items WHERE id IN (?, ?) ORDER BY id = ?', lamp, cane, cane))).toEqual([
      { id: lamp, state: 'out-of-service', condition: 'damaged' }, { id: cane, state: 'missing', condition: 'good' },
    ])
    expect(await loanState(loanId)).toBe('returned')
  })
})
