// Box office's answers for the booking button (Box office specification, part 5, "The booking action
// in the core's states"): on sale is available, or limited once nearly full, saying only as much as
// availability.seats-left allows; no free seat is sold out; paused or past closing is closed; a draft with an opening time is
// not yet; and a date with no sales record gets no answer from Box office, so it falls back to the
// theatre's own link.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit } from '#kit'
import { bookingActions, priceSummaries } from '#modules/core'
import { env, inContext, rows } from '../../../../tests/integration/helpers'
import { buy, house, ready, req, type House } from './stage'

async function answers(...houses: House[]) {
  const subjects = await rows<{ id: string, production_id: string, starts_at: number, ends_at: number, capacity: number | null }>(
    'SELECT id, production_id, starts_at, ends_at, capacity FROM core_performances WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(houses.map(h => h.performanceId)))
  return inContext(() => bookingActions(subjects.map(s => ({ id: s.id, productionId: s.production_id, startsAt: s.starts_at, endsAt: s.ends_at, capacity: s.capacity, externalBookingUrl: null, productionBookingUrl: null }))))
}

async function setting(key: string, value: unknown) {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), key, value, { reason: 'test', confirm: true })
    await unit.commit()
  })
}

describe('the booking button from Box office', () => {
  beforeAll(ready)

  it('says available with a link to Choose tickets, and limited with the seats left once nearly full', async () => {
    const big = await house(50)
    const small = await house(5)
    const found = await answers(big, small)
    const slug = (await rows<{ slug: string }>('SELECT slug FROM core_productions WHERE id = ?', big.productionId))[0]!.slug
    expect(found[big.performanceId]).toEqual({ state: 'available', link: `/book/${slug}/${big.performanceId}`, drawer: 'BoxOfficeBookingDrawer' })
    // Nearly full is 10% of the house as shipped: one seat of five.
    expect(found[small.performanceId]).toMatchObject({ state: 'available' })
    expect((await buy(small, 4)).ok).toBe(true)
    expect((await answers(small))[small.performanceId]).toMatchObject({ state: 'limited', seatsLeft: 1, drawer: 'BoxOfficeBookingDrawer' })
    await setting('box-office.availability.threshold-unit', 'seats')
    expect((await answers(big))[big.performanceId]).toEqual({ state: 'available', link: `/book/${slug}/${big.performanceId}`, drawer: 'BoxOfficeBookingDrawer' })
    await setting('box-office.availability.show-remaining-under', 50)
    expect((await answers(big))[big.performanceId]).toMatchObject({ state: 'limited', seatsLeft: 50 })
    await setting('box-office.availability.show-remaining-under', 0)
    expect((await answers(big))[big.performanceId]!.state).toBe('available')
    await setting('box-office.availability.show-remaining-under', 20)
    await setting('box-office.availability.threshold-unit', 'share')
  })

  it('says no more than the theatre\'s level allows: never the number below the most open', async () => {
    const h = await house(10)
    expect((await buy(h, 6)).ok).toBe(true)
    await setting('box-office.availability.seats-left', 'progress')
    expect((await answers(h))[h.performanceId]).toMatchObject({ state: 'available', sellingFast: true })
    expect((await buy(h, 3)).ok).toBe(true)
    const progress = (await answers(h))[h.performanceId]!
    expect(progress).toMatchObject({ state: 'limited' })
    expect(progress.seatsLeft).toBeUndefined()
    await setting('box-office.availability.seats-left', 'nearly-full')
    expect((await answers(h))[h.performanceId]).not.toHaveProperty('seatsLeft')
    await setting('box-office.availability.seats-left', 'sold-out')
    expect((await answers(h))[h.performanceId]).toMatchObject({ state: 'available' })
    expect((await answers(h))[h.performanceId]).not.toHaveProperty('seatsLeft')
    await setting('box-office.availability.seats-left', 'count')
  })

  it('says sold out when no seat is free', async () => {
    const h = await house(2)
    expect((await buy(h, 2)).ok).toBe(true)
    expect((await answers(h))[h.performanceId]).toEqual({ state: 'sold-out' })
  })

  it('says closed when sales are paused', async () => {
    const h = await house(10)
    expect((await req('POST', `/api/box-office/performances/${h.performanceId}/sales/pause`, {})).status).toBe(200)
    expect((await answers(h))[h.performanceId]).toEqual({ state: 'closed' })
  })

  it('says not yet for a draft with an opening time, and nothing for a draft without one', async () => {
    const h = await house(10, { open: false })
    expect((await answers(h))[h.performanceId]).toBeUndefined()
    const opensAt = Date.UTC(2027, 0, 8, 10)
    expect((await req('PUT', `/api/box-office/performances/${h.performanceId}/sales`, { onSaleAt: opensAt })).status).toBe(200)
    expect((await answers(h))[h.performanceId]).toEqual({ state: 'not-yet', opensAt })
  })

  it('prices a production from the lowest price needing no proof or membership online, with lower prices for those who qualify by name', async () => {
    const h = await house(10)
    const member = await req('POST', '/api/box-office/ticket-types', { name: `Member rate ${h.productionId}`, requirementRefs: ['seats:member'] })
    expect(member.status, JSON.stringify(member.body)).toBe(200)
    const dearer = await req('POST', '/api/box-office/ticket-types', { name: `Patron rate ${h.productionId}`, requirementRefs: ['seats:member'] })
    const deskOnly = await req('POST', '/api/box-office/ticket-types', { name: `Door deal ${h.productionId}`, channel: 'desk' })
    expect(deskOnly.status, JSON.stringify(deskOnly.body)).toBe(200)
    const set = await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [
      { bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 1200 },
      { bandId: h.bandId, ticketTypeId: h.concessionId, amountMinor: 900 },
      { bandId: h.bandId, ticketTypeId: member.body.ticketTypeId, amountMinor: 400 },
      { bandId: h.bandId, ticketTypeId: dearer.body.ticketTypeId, amountMinor: 1500 },
      { bandId: h.bandId, ticketTypeId: deskOnly.body.ticketTypeId, amountMinor: 300 },
    ] })
    expect(set.status, JSON.stringify(set.body)).toBe(200)
    const found = await inContext(() => priceSummaries([h.productionId]))
    // The concession asks for proof, so it is named rather than read as "From"; the member rate is held by an account, so it is gated.
    expect(found[h.productionId]).toEqual({ currency: 'GBP', fromMinor: 1200, toMinor: 1200, others: [{ label: `Member rate ${h.productionId}`, amountMinor: 400, gated: true }, { label: 'Concession', amountMinor: 900 }] })
  })

  it('quotes a price held by a membership anyone may join, but not one held by something they cannot take up', async () => {
    const h = await house(10)
    const member = await req('POST', '/api/box-office/ticket-types', { name: `Joinable member ${h.productionId}`, requirementRefs: ['seats:joinable'] })
    expect(member.status, JSON.stringify(member.body)).toBe(200)
    const fellow = await req('POST', '/api/box-office/ticket-types', { name: `Fellow ${h.productionId}`, requirementRefs: ['seats:member'] })
    const set = await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [
      { bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 800 },
      { bandId: h.bandId, ticketTypeId: member.body.ticketTypeId, amountMinor: 600 },
      { bandId: h.bandId, ticketTypeId: fellow.body.ticketTypeId, amountMinor: 0 },
    ] })
    expect(set.status, JSON.stringify(set.body)).toBe(200)
    const found = await inContext(() => priceSummaries([h.productionId]))
    expect(found[h.productionId]!.others).toEqual([
      { label: `Fellow ${h.productionId}`, amountMinor: 0, gated: true },
      { label: `Joinable member ${h.productionId}`, amountMinor: 600 },
    ])
  })

  it('gives no price for a production whose dates are past or not priced', async () => {
    const past = await house(10)
    await env.DB.prepare('UPDATE core_performances SET starts_at = ?1, ends_at = ?1 + 3600000, doors_at = NULL WHERE id = ?2').bind(Date.now() - 86_400_000, past.performanceId).run() // not-policy: a day ago
    const unpriced = await house(10, { open: false })
    const found = await inContext(() => priceSummaries([past.productionId, unpriced.productionId]))
    expect(found).toEqual({})
  })
})
