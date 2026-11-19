// Making a reservation complimentary afterwards (Matt, 2026-11-19): every ticket on it becomes free on
// the same seats and the order is confirmed and sent, through a request decided like any other; a
// reservation with a pass on it, or one changed while it waited, is refused. "Production team" is a reason.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock, type UnitView } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { listTerms } from '#modules/core'
import { openSession } from '../../../payments/server/services'
import { ensureManagedTicketTypes } from '../../server/ticket-types'
import { env, inContext, person, rows } from '../../../../tests/integration/helpers'
import topUp from '../../../../migrations/20261119150000_production-team-comps/migration.sql?raw'
import { house, NOV_16, ready, req, type House } from './stage'

const seller = person(['payments.session.open', 'payments.attempt.attest', 'box-office.order.view', 'box-office.order.sell', 'box-office.order.take-payment', 'box-office.order.release', 'box-office.comp.request'])
const approver = person(['box-office.comp.request', 'box-office.comp.approve', 'box-office.order.view'])
const onlooker = person(['box-office.order.view'])
let reason: string
let h: House
let n = 0

function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}
const set = (key: string, value: unknown) => commit(unit => changeSetting(unit.view() as UnitView, key as any, value as any, { reason: 'test', confirm: true }))
const tickets = (count: number) => ({ performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: count }] })
async function reserve(count: number): Promise<{ orderId: string, reference: string }> {
  const each = (await req('POST', '/api/payments/till/summary', { panels: [{ basket: 'box-office', input: tickets(1) }] }, seller)).body.amountMinor as number
  const done = await req('POST', '/api/box-office/desk/reserve', { sale: tickets(count), expectedTotalMinor: each * count, email: `director${++n}@example.org` }, seller)
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  expect(done.body.state).toBe('reserved')
  return done.body
}
const comp = (orderId: string, actor = seller, reasonTermId = reason) => req('POST', `/api/box-office/orders/${orderId}/comp`, { reasonTermId }, actor)
const claims = (orderId: string) => rows<{ id: string, state: string }>('SELECT c.id, c.state FROM box_office_claims c JOIN box_office_holds k ON k.id = c.hold_id WHERE k.order_id = ? ORDER BY c.id', orderId)

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  h = await house(30)
  await inContext(() => ensureManagedTicketTypes())
  await commit(unit => openSession(unit.view(), { accountId: seller.accountId!, pointLabel: 'Desk', floatMinor: 0 }))
  reason = (await inContext(() => listTerms('box-office.comp-reason'))).find(t => t.slug === 'production-team')!.id
})

describe('reasons for complimentary tickets', () => {
  it('include a production team, apart from cast and crew', async () => {
    const terms = await inContext(() => listTerms('box-office.comp-reason'))
    const slugs = terms.map(t => t.slug)
    expect(terms.find(t => t.slug === 'production-team')?.label).toBe('Production team')
    expect(slugs.indexOf('production-team')).toBe(slugs.indexOf('crew') + 1)
  })

  it('reach a site whose list was made before, once, after Crew', async () => {
    const run = () => env.DB.batch(topUp.split('--> statement-breakpoint').map(s => env.DB.prepare(s)))
    const order = async () => (await rows<{ slug: string, sort: number }>('SELECT slug, sort FROM core_terms WHERE vocabulary_key = \'box-office.comp-reason\' ORDER BY sort, slug'))
    const now = await order()
    await env.DB.prepare('DELETE FROM core_terms WHERE vocabulary_key = \'box-office.comp-reason\' AND slug = \'production-team\'').run()
    await env.DB.prepare('UPDATE core_terms SET sort = sort - 1 WHERE vocabulary_key = \'box-office.comp-reason\' AND sort > (SELECT sort FROM core_terms WHERE vocabulary_key = \'box-office.comp-reason\' AND slug = \'crew\')').run()
    await run()
    await run()
    const after = await order()
    expect(after.map(t => t.slug)).toEqual(now.map(t => t.slug))
    expect(new Set(after.map(t => t.sort)).size).toBe(after.length)
    reason = (await inContext(() => listTerms('box-office.comp-reason'))).find(t => t.slug === 'production-team')!.id
  })
})

describe('making a reservation complimentary', () => {
  it('waits for an approver, then confirms the same seats at nothing and sends the tickets', async () => {
    const { orderId } = await reserve(2)
    const before = await claims(orderId)
    const page = await req('GET', `/api/box-office/orders/${orderId}`, undefined, seller)
    expect(page.body.can.comp).toBe(true)

    const asked = await comp(orderId)
    expect(asked.status, JSON.stringify(asked.body)).toBe(200)
    expect(asked.body.issued).toBe(false)
    // Until it is decided the reservation stands, and nobody can ask twice.
    expect((await rows('SELECT state FROM box_office_orders WHERE id = ?', orderId))).toEqual([{ state: 'reserved' }])
    expect((await req('GET', `/api/box-office/orders/${orderId}`, undefined, seller)).body.compPending).toBe(true)
    expect((await comp(orderId)).body.code).toBe('box-office.comp.already-asked')
    // The asker cannot approve it; the approver sees which reservation it is.
    expect((await req('POST', `/api/box-office/comps/${asked.body.requestId}/approve`, {}, seller)).status).toBe(403)
    const waiting = (await req('GET', '/api/box-office/comps', undefined, approver)).body.waiting.find((r: { id: string }) => r.id === asked.body.requestId)
    expect(waiting).toMatchObject({ quantity: 2, reservation: asked.body.reference, reason: 'Production team' })

    const approved = await req('POST', `/api/box-office/comps/${asked.body.requestId}/approve`, {}, approver)
    expect(approved.status, JSON.stringify(approved.body)).toBe(200)
    expect(approved.body.orderId).toBe(orderId)
    expect(await rows('SELECT state, total_minor, release_at FROM box_office_orders WHERE id = ?', orderId)).toEqual([{ state: 'confirmed', total_minor: 0, release_at: null }])
    const lines = await rows<{ amount_minor: number, comp_request_id: string, kind: string }>(
      'SELECT l.amount_minor, l.comp_request_id, t.kind FROM box_office_order_lines l JOIN box_office_ticket_types t ON t.id = l.ticket_type_id JOIN box_office_tickets k ON k.order_line_id = l.id WHERE l.order_id = ? AND l.state = \'live\'', orderId)
    expect(lines).toEqual([0, 1].map(() => ({ amount_minor: 0, comp_request_id: asked.body.requestId, kind: 'complimentary' })))
    expect(await claims(orderId)).toEqual(before.map(c => ({ ...c, state: 'confirmed' })))
    expect(await rows('SELECT state, order_id FROM box_office_comp_requests WHERE id = ?', asked.body.requestId)).toEqual([{ state: 'issued', order_id: orderId }])
    expect(await rows('SELECT id FROM core_notifications WHERE type_key IN (\'box-office.order-confirmed\', \'box-office.order-confirmed-guest\') AND subject_id = ?', orderId)).toHaveLength(1)
    // Nothing was paid, so no money is recorded, and Orders shows it as complimentary.
    const shown = await req('GET', `/api/box-office/orders/${orderId}`, undefined, onlooker)
    expect(shown.body).toMatchObject({ state: 'confirmed', complimentary: true, compPending: false, payments: [], totalMinor: 0 })
    const listed = (await req('GET', '/api/box-office/orders', undefined, onlooker)).body
    expect(JSON.stringify(listed)).toContain(orderId)
  })

  it('happens at once when the theatre needs no approval', async () => {
    await set('box-office.comps.needs-approval', false)
    try {
      const { orderId } = await reserve(1)
      const done = await comp(orderId)
      expect(done.status, JSON.stringify(done.body)).toBe(200)
      expect(done.body.issued).toBe(true)
      expect(await rows('SELECT state, total_minor FROM box_office_orders WHERE id = ?', orderId)).toEqual([{ state: 'confirmed', total_minor: 0 }])
    }
    finally {
      await set('box-office.comps.needs-approval', true)
    }
  })

  it('is refused once the reservation has changed while it waited', async () => {
    const { orderId } = await reserve(2)
    const asked = await comp(orderId)
    expect((await req('POST', `/api/box-office/orders/${orderId}/release`, {}, seller)).status).toBe(200)
    expect((await req('POST', `/api/box-office/comps/${asked.body.requestId}/approve`, {}, approver)).body.code).toBe('box-office.comp.reservation-gone')
    expect((await req('POST', `/api/box-office/comps/${asked.body.requestId}/decline`, {}, approver)).status).toBe(200)
  })

  it('needs the right to ask for complimentary tickets, a reason from the list, and a reservation within the request size', async () => {
    const { orderId } = await reserve(2)
    expect((await req('GET', `/api/box-office/orders/${orderId}`, undefined, onlooker)).body.can.comp).toBe(false)
    expect((await comp(orderId, onlooker)).status).toBe(403)
    const cast = (await inContext(() => listTerms('box-office.cancellation-reason')))[0]!.id
    expect((await comp(orderId, seller, cast)).body.code).toBe('box-office.comp.bad-reason')
    await set('box-office.comps.per-request', 1)
    try {
      expect((await comp(orderId)).body.code).toBe('box-office.comp.too-many')
    }
    finally {
      await set('box-office.comps.per-request', 4)
    }
  })

  it('refuses an order that is not a reservation', async () => {
    const { orderId } = await reserve(1)
    const asked = await comp(orderId)
    await req('POST', `/api/box-office/comps/${asked.body.requestId}/approve`, {}, approver)
    expect((await comp(orderId)).body.code).toBe('box-office.desk.not-reserved')
  })
})
