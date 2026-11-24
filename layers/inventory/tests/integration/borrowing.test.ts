// Members borrowing kit (INV-20, INV-27; L2, L3, L4, L16, I9): the catalogue with what is free over
// their dates, a request split per department, their own loans, cancelling a request, and nobody
// approving their own.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId } from '#kit'
import { call, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import catalogueRoute from '../../server/api/inventory/catalogue.get'
import requestRoute from '../../server/api/inventory/requests/index.post'
import myLoansRoute from '../../server/api/inventory/my/loans/index.get'
import myLoanRoute from '../../server/api/inventory/my/loans/[id].get'
import approve from '../../server/api/inventory/loans/[id]/approve.post'
import cancel from '../../server/api/inventory/loans/[id]/cancel.post'
import { day, item, ready, request, shelf } from './stage'

const app = server({
  'GET /api/inventory/catalogue': catalogueRoute,
  'POST /api/inventory/requests': requestRoute,
  'GET /api/inventory/my/loans': myLoansRoute,
  'GET /api/inventory/my/loans/:id': myLoanRoute,
  'POST /api/inventory/loans/:id/approve': approve,
  'POST /api/inventory/loans/:id/cancel': cancel,
})

const member = () => person(['inventory.loan.request'])
async function req<T = any>(method: string, path: string, body: unknown, actor: object): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor: actor as any, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}
const code = (r: { body: any }) => r.body?.code ?? r.body?.data?.code
const ok = (r: { status: number, body: any }) => {
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body
}
async function browsing(on: boolean) {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'inventory.catalogue.members-browse', on, { reason: 'test', confirm: true })
    await unit.commit()
  })
}

beforeAll(ready)

describe('the catalogue (INV-20, L3, I9)', () => {
  it('lists what departments lend to members, with how many are free over the dates, and nothing of value', async () => {
    const s = await shelf('members')
    const productionsOnly = await shelf('productions')
    const [coat, chairs] = [await item(s), await item(s, { quantity: 8 })]
    const hidden = await item(productionsOnly)
    await request(s, 2, 6, [{ itemId: coat }, { itemId: chairs, quantity: 3 }]).then(l => req('POST', `/api/inventory/loans/${l.id}/approve`, {}, person(['inventory.loan.approve'])))
    const someone = member()
    const all = ok(await req('GET', '/api/inventory/catalogue', undefined, someone)).items
    expect(all.map((i: any) => i.id)).toEqual(expect.arrayContaining([coat, chairs]))
    expect(all.map((i: any) => i.id)).not.toContain(hidden)
    expect(all.find((i: any) => i.id === coat)).toEqual({ id: coat, tag: expect.any(String), name: expect.any(String), category: expect.any(String), departmentId: s.departmentId, department: expect.any(String), tracking: 'individual', available: null })
    const then = ok(await req('GET', `/api/inventory/catalogue?startsOn=${day(3)}&dueBackOn=${day(4)}`, undefined, someone)).items
    expect([coat, chairs].map(id => then.find((i: any) => i.id === id).available)).toEqual([0, 5])
    const later = ok(await req('GET', `/api/inventory/catalogue?startsOn=${day(10)}&dueBackOn=${day(12)}`, undefined, someone)).items
    expect([coat, chairs].map(id => later.find((i: any) => i.id === id).available)).toEqual([1, 8])
  })

  it('is closed when the theatre does not let members browse', async () => {
    await browsing(false)
    expect(code(await req('GET', '/api/inventory/catalogue', undefined, member()))).toBe('inventory.catalogue.closed')
    await browsing(true)
  })
})

describe('asking and my loans (INV-20, INV-27, L2, L4, L16)', () => {
  it('splits a basket into one request per department, the member responsible, and shows them as mine', async () => {
    const [props, costume] = [await shelf('members'), await shelf('anyone')]
    const [fan, hat] = [await item(props), await item(costume)]
    const me = member()
    const { loanIds } = ok(await req('POST', '/api/inventory/requests', { startsOn: day(2), dueBackOn: day(4), purpose: 'Society ball', lines: [{ itemId: fan }, { itemId: hat }] }, me))
    expect(loanIds).toHaveLength(2)
    const made = await rows<{ department_id: string, state: string, kind: string, responsible_account_id: string }>('SELECT department_id, state, kind, responsible_account_id FROM inventory_loans WHERE id IN (?, ?) ORDER BY department_id = ?', ...loanIds, costume.departmentId)
    expect(made).toEqual([
      { department_id: props.departmentId, state: 'requested', kind: 'member', responsible_account_id: me.accountId },
      { department_id: costume.departmentId, state: 'requested', kind: 'member', responsible_account_id: me.accountId },
    ])
    expect(ok(await req('GET', '/api/inventory/my/loans', undefined, me)).loans.map((l: any) => l.id).sort()).toEqual([...loanIds].sort())
    expect(ok(await req('GET', '/api/inventory/my/loans', undefined, member())).loans).toEqual([])
    const mine = ok(await req('GET', `/api/inventory/my/loans/${loanIds[0]}`, undefined, me)).loan
    expect(mine.can).toEqual({ approve: false, edit: false, cancel: true, submit: false })
    expect((await req('GET', `/api/inventory/my/loans/${loanIds[0]}`, undefined, member())).status).toBe(403)
  })

  it('refuses a department that lends only to productions, lets a member cancel their own request, and no one approve their own', async () => {
    const productionsOnly = await shelf('productions')
    expect(code(await req('POST', '/api/inventory/requests', { startsOn: day(2), dueBackOn: day(4), purpose: 'Party', lines: [{ itemId: await item(productionsOnly) }] }, member()))).toBe('inventory.loan.not-lent')
    const s = await shelf('members')
    const lead = person(['inventory.loan.request', 'inventory.loan.approve'])
    const { loanIds: [own] } = ok(await req('POST', '/api/inventory/requests', { startsOn: day(2), dueBackOn: day(4), purpose: 'My own', lines: [{ itemId: await item(s) }] }, lead))
    expect(code(await req('POST', `/api/inventory/loans/${own}/approve`, {}, lead))).toBe('core.access.own-record')
    const me = member()
    const { loanIds: [asked] } = ok(await req('POST', '/api/inventory/requests', { startsOn: day(2), dueBackOn: day(4), purpose: 'Party', lines: [{ itemId: await item(s) }] }, me))
    expect((await req('POST', `/api/inventory/loans/${asked}/cancel`, {}, member())).status).toBe(403)
    ok(await req('POST', `/api/inventory/loans/${asked}/cancel`, {}, me))
    expect((await rows('SELECT state, cancel_reason FROM inventory_loans WHERE id = ?', asked))[0]).toEqual({ state: 'cancelled', cancel_reason: 'by-borrower' })
  })
})
