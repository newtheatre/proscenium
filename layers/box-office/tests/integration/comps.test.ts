// Complimentary tickets (BO-62, BO-63): a request names how many, for whom and why; approving issues
// zero-price tickets on the complimentary ticket type at once, within the performance's cap; nobody
// decides their own request; the requester can withdraw it and sees the decision.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock, type UnitView } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { listTerms } from '#modules/core'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import { doorCodesForOrder } from '../../server/tickets'
import { house, NOV_16, ready, req, type House } from './stage'

const requester = person(['box-office.comp.request'])
const approver = person(['box-office.comp.request', 'box-office.comp.approve'])
let reason: string
let h: House

function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}
const set = (key: string, value: unknown) => commit(unit => changeSetting(unit.view() as UnitView, key as any, value as any, { reason: 'test', confirm: true }))
const ask = (body: Record<string, unknown> = {}, actor = requester) =>
  req('POST', '/api/box-office/comps', { performanceId: h.performanceId, bandId: h.bandId, quantity: 2, email: 'critic@example.org', name: 'A Critic', reasonTermId: reason, ...body }, actor)
const decide = (id: string, verb: 'approve' | 'decline' | 'withdraw', actor = approver) => req('POST', `/api/box-office/comps/${id}/${verb}`, {}, actor)

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  reason = (await inContext(() => listTerms('box-office.comp-reason'))).find(t => t.slug === 'press')!.id
  h = await house(20)
})

describe('complimentary tickets', () => {
  it('issues zero-price tickets on approval, on the Complimentary type Box office keeps', async () => {
    const asked = await ask()
    expect(asked.status).toBe(200)
    const id = asked.body.requestId as string
    const approved = await decide(id, 'approve')
    expect(approved.status).toBe(200)
    expect(approved.body.state).toBe('issued')
    const [order] = await rows<{ state: string, total_minor: number }>('SELECT state, total_minor FROM box_office_orders WHERE id = ?', approved.body.orderId)
    expect(order).toMatchObject({ state: 'confirmed', total_minor: 0 })
    const issued = await rows<{ amount_minor: number, comp_request_id: string }>('SELECT l.amount_minor, l.comp_request_id FROM box_office_order_lines l JOIN box_office_tickets t ON t.order_line_id = l.id WHERE l.order_id = ?', approved.body.orderId)
    expect(issued).toHaveLength(2)
    expect(issued.every(l => l.amount_minor === 0 && l.comp_request_id === id)).toBe(true)

    const seen = await req('GET', '/api/box-office/comps', undefined, requester)
    expect(seen.body.mine.find((r: { id: string }) => r.id === id)).toMatchObject({ state: 'issued', quantity: 2, forName: 'A Critic', reason: 'Press' })
    // The approver finds what they decided, with the order it made.
    const decided = await req('GET', '/api/box-office/comps', undefined, approver)
    expect(decided.body.decided.find((r: { id: string }) => r.id === id)).toMatchObject({ state: 'issued', orderId: approved.body.orderId })
    expect(seen.body.decided).toEqual([])
    // Orders shows it as complimentary, not as paid.
    const page = await req('GET', `/api/box-office/orders/${approved.body.orderId}`, undefined, person(['box-office.order.view']))
    expect(page.body.complimentary).toBe(true)
    // At the till, a comp's ticket scanned says it is a comp, so nobody tries to take money for it.
    const [code] = await inContext(() => doorCodesForOrder(approved.body.orderId))
    const desk = await req('GET', `/api/box-office/desk/orders?q=${encodeURIComponent(code!.doorCode!)}`, undefined, person(['box-office.order.view']))
    expect(desk.body.orders).toEqual([expect.objectContaining({ orderId: approved.body.orderId, state: 'confirmed', amountDueMinor: 0, scannedLineId: code!.lineId })])
    expect(desk.body.orders[0].lines.every((l: { free: string | null }) => l.free === 'comp')).toBe(true)
    // The sales report counts them as complimentary, not as sold at the desk.
    const report = await req('GET', `/api/box-office/reports/sales?productionId=${h.productionId}`, undefined, person(['box-office.report.view']))
    expect(report.body.report.byChannel).toEqual([expect.objectContaining({ channel: 'complimentary', tickets: 2, valueMinor: 0 })])
  })

  it('takes the seats with most room when no band is chosen, and offers no performance that has started', async () => {
    const asked = await ask({ bandId: undefined, quantity: 1 })
    expect(asked.status, JSON.stringify(asked.body)).toBe(200)
    expect(await rows('SELECT band_id FROM box_office_comp_requests WHERE id = ?', asked.body.requestId)).toEqual([{ band_id: h.bandId }])
    expect((await decide(asked.body.requestId, 'withdraw', requester)).status).toBe(200)
    const seen = await req('GET', '/api/box-office/comps', undefined, requester)
    expect(seen.body.performances.every((p: { startsAt: number }) => p.startsAt > NOV_16)).toBe(true)
  })

  it('never lets anyone decide their own request', async () => {
    const own = (await ask({}, approver)).body.requestId as string
    expect((await decide(own, 'approve', approver)).status).toBe(403)
    expect((await req('GET', '/api/box-office/comps', undefined, approver)).body.waiting.map((r: { id: string }) => r.id)).not.toContain(own)
  })

  it('puts requests waiting for a decision on the approver\'s console home, not the requester\'s', async () => {
    const waiting = (await ask()).body.requestId as string
    const home = async (actor: typeof approver) => (await req('GET', '/api/core/home?home=console', undefined, actor)).body.cards as { id: string, count?: number }[]
    const card = (await home(approver)).find(c => c.id === 'box-office.comps')
    expect(card?.count).toBeGreaterThanOrEqual(1)
    expect((await home(requester)).map(c => c.id)).not.toContain('box-office.comps')
    expect((await decide(waiting, 'decline')).status).toBe(200)
  })

  it('keeps a performance within its cap and a request within its size', async () => {
    expect((await ask({ quantity: 5 })).body).toMatchObject({ code: 'box-office.comp.too-many' })
    await set('box-office.comps.per-performance', 3)
    const over = (await ask()).body.requestId as string
    expect((await decide(over, 'approve')).body).toMatchObject({ code: 'box-office.comp.over-cap' })
    const fits = (await ask({ quantity: 1 })).body.requestId as string
    expect((await decide(fits, 'approve')).status).toBe(200)
    await set('box-office.comps.per-performance', null)
  })

  it('lets the requester withdraw, and an approver decline, only while it is waiting', async () => {
    const mine = (await ask()).body.requestId as string
    expect((await decide(mine, 'withdraw', approver)).status).toBe(403)
    expect((await decide(mine, 'withdraw', requester)).body.state).toBe('withdrawn')
    expect((await decide(mine, 'decline')).body).toMatchObject({ code: 'box-office.comp.changed' })
    const other = (await ask()).body.requestId as string
    expect((await decide(other, 'decline')).body.state).toBe('declined')
    expect((await req('GET', '/api/box-office/comps', undefined, approver)).body.waiting.map((r: { id: string }) => r.id)).not.toContain(other)
  })

  it('offers the performances the person may ask for, with their bands', async () => {
    const seen = await req('GET', '/api/box-office/comps', undefined, requester)
    const row = seen.body.performances.find((p: { id: string }) => p.id === h.performanceId)
    expect(row.bands.map((b: { id: string }) => b.id)).toContain(h.bandId)
  })
  it('issues straight away, with no approver, when the theatre does not need approval', async () => {
    await set('box-office.comps.needs-approval', false)
    try {
      expect((await req('GET', '/api/box-office/comps', undefined, requester)).body.needsApproval).toBe(false)
      const asked = await ask()
      expect(asked.status, JSON.stringify(asked.body)).toBe(200)
      expect(asked.body.issued).toBe(true)
      const [request] = await rows<{ state: string, order_id: string, decided_by: string }>('SELECT state, order_id, decided_by FROM box_office_comp_requests WHERE id = ?', asked.body.requestId)
      expect(request).toMatchObject({ state: 'issued', decided_by: null })
      expect(await rows('SELECT state, total_minor FROM box_office_orders WHERE id = ?', request!.order_id)).toEqual([{ state: 'confirmed', total_minor: 0 }])
      expect((await req('GET', '/api/box-office/comps', undefined, approver)).body.waiting.map((r: { id: string }) => r.id)).not.toContain(asked.body.requestId)
    }
    finally {
      await set('box-office.comps.needs-approval', true)
    }
  })
})
