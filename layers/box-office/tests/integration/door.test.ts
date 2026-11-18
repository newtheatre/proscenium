// The door (BO-40; Box office specification, part 4, "The door"): a valid ticket is admitted once,
// however many devices scan it together; a second scan says Already in, with when and where; a
// ticket for another performance, a void ticket and a code that is not ours each say so; and a desk
// code or a booking reference says Not paid and writes no scan row. A ticket sold on a requirement
// is checked again before it is admitted (BO-45).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, changeSetting, createUnit, newId, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { listTerms } from '#modules/core'
import { inContext, person, rows, setModule } from '../../../../tests/integration/helpers'
import { members } from '../../../../tests/fixtures/modules/seats/server/contributions/core.requirement/seats'
import attendance from '../../server/contributions/front-of-house.report-section/attendance'
import { doorCodesForOrder } from '../../server/tickets'
import { buy, house, NOV_16, ready, req, type House } from './stage'

const steward = person(['box-office.ticket.admit'])
const count = async (sql: string, ...params: unknown[]) => (await rows<{ n: number }>(sql, ...params))[0]!.n
let guests = 0

/** A house whose tickets are free, so an order is confirmed, with its door codes, at checkout. */
async function freeHouse(capacity: number): Promise<House> {
  const h = await house(capacity)
  expect((await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 0 }] })).status).toBe(200)
  return h
}

async function tickets(h: House, quantity: number): Promise<string[]> {
  const made = await buy(h, quantity)
  if (!made.ok) throw new Error(made.code)
  const done = await req('POST', `/api/box-office/baskets/${made.basket.orderId}/checkout`, { expectedTotalMinor: 0, email: `door${++guests}@example.org` }, null, { 'x-basket-token': made.basket.token })
  expect(done.body.state, JSON.stringify(done.body)).toBe('confirmed')
  return done.body.doorCodes
}

const scan = (h: House, code: string, deviceLabel?: string, actor = steward) => req('POST', `/api/box-office/performances/${h.performanceId}/scan`, { code, ...(deviceLabel ? { deviceLabel } : {}) }, actor)

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'box-office.reservations.confirm-email', false, { reason: 'test', confirm: true })
    await unit.commit()
  })
})

describe('scanning at the door', () => {
  it('admits a valid ticket, and says Already in, with when and where, on a second scan', async () => {
    const h = await freeHouse(4)
    const [code] = await tickets(h, 1)
    const first = await scan(h, code!, 'Left door')
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body).toMatchObject({ result: 'admitted', booking: { ticketType: 'Full price', admitted: 1, tickets: 1 } })
    advanceClock(60_000)
    const second = await scan(h, code!, 'Right door')
    expect(second.body).toMatchObject({ result: 'already_admitted', admittedAt: NOV_16, admittedAtDoor: 'Left door', ticketId: first.body.ticketId })
    expect(await rows('SELECT result, device_label, scanned_by FROM box_office_scans WHERE ticket_id = ? ORDER BY scanned_at', first.body.ticketId))
      .toEqual([{ result: 'admitted', device_label: 'Left door', scanned_by: steward.accountId }, { result: 'already_admitted', device_label: 'Right door', scanned_by: steward.accountId }])
    expect((await rows<{ admitted_at: number }>('SELECT admitted_at FROM box_office_tickets WHERE id = ?', first.body.ticketId))[0]!.admitted_at).toBe(NOV_16)
  })

  it('admits once when twenty devices scan the same ticket together', async () => {
    const h = await freeHouse(4)
    const [code] = await tickets(h, 1)
    resetRateLimits()
    const outcomes = await Promise.all(Array.from({ length: 20 }, (_, i) => scan(h, code!, `Door ${i}`)))
    expect(outcomes.filter(o => o.body.result === 'admitted')).toHaveLength(1)
    expect(outcomes.filter(o => o.body.result === 'already_admitted')).toHaveLength(19)
    expect(await count("SELECT count(*) AS n FROM box_office_scans WHERE performance_id = ? AND result = 'admitted'", h.performanceId)).toBe(1)
    expect(await count('SELECT count(*) AS n FROM box_office_scans WHERE performance_id = ?', h.performanceId)).toBe(20)
  })

  it('says so for a ticket for another performance, a void ticket, a forged code and a code that is not ours', async () => {
    const h = await freeHouse(4)
    const other = await freeHouse(4)
    const [code, second] = await tickets(h, 2)
    expect((await scan(other, code!)).body).toMatchObject({ result: 'wrong_performance', ticketPerformanceId: h.performanceId, ticketPerformance: { id: h.performanceId, startsAt: expect.any(Number), title: expect.any(String) } })

    const [kind, keyId, random, signature] = second!.split('.') as [string, string, string, string]
    const forged = `${kind}.${keyId}.${random.slice(0, -1)}${random.endsWith('A') ? 'B' : 'A'}.${signature}`
    expect((await scan(h, forged)).body).toMatchObject({ result: 'bad_signature' })
    expect((await scan(h, 'not a ticket at all')).body).toMatchObject({ result: 'unknown' })

    await rows("UPDATE box_office_tickets SET state = 'void', void_reason = 'cancelled' WHERE order_line_id IN (SELECT order_line_id FROM box_office_tickets WHERE performance_id = ?) RETURNING id", h.performanceId)
    expect((await scan(h, second!)).body).toMatchObject({ result: 'void', voidReason: 'cancelled' })
    // Nobody was admitted by any of that.
    expect(await count('SELECT count(*) AS n FROM box_office_tickets WHERE performance_id = ? AND admitted_at IS NOT NULL', h.performanceId)).toBe(0)
    expect(await rows('SELECT result FROM box_office_scans WHERE performance_id IN (?, ?) ORDER BY result', h.performanceId, other.performanceId))
      .toEqual([{ result: 'bad_signature' }, { result: 'unknown' }, { result: 'void' }, { result: 'wrong_performance' }])
  })

  it('says Not paid for a desk code or a booking reference, and writes no scan row', async () => {
    const h = await house(4)
    const made = await buy(h, 1)
    if (!made.ok) throw new Error(made.code)
    const reserved = await req('POST', `/api/box-office/baskets/${made.basket.orderId}/reserve`, { expectedTotalMinor: made.basket.totalMinor, email: `door${++guests}@example.org` }, null, { 'x-basket-token': made.basket.token })
    expect(reserved.body.state, JSON.stringify(reserved.body)).toBe('reserved')
    // What the door shows, so it can send them to the box office or the bar to pay.
    const unpaid = { result: 'not_paid', scanId: null, reservation: { reference: reserved.body.reference, buyer: expect.any(String), tickets: 1, amountDueMinor: made.basket.totalMinor, currency: 'GBP' } }
    expect((await scan(h, reserved.body.deskCode)).body).toEqual(unpaid)
    // The live door counts them as still to come.
    expect((await req('GET', `/api/box-office/performances/${h.performanceId}/door/summary`, undefined, steward)).body).toMatchObject({ tickets: 0, admitted: 0, unpaid: 1 })
    expect((await scan(h, reserved.body.reference)).body).toEqual(unpaid)
    expect(await count('SELECT count(*) AS n FROM box_office_scans WHERE performance_id = ?', h.performanceId)).toBe(0)
    // At another performance's door it is not for tonight, paid or not.
    const other = await house(4)
    expect((await scan(other, reserved.body.deskCode)).body).toMatchObject({ result: 'wrong_performance', ticketPerformanceId: h.performanceId })
  })

  it('names the performance for a paid booking\'s reference at another door, and finds it at its own', async () => {
    const h = await freeHouse(4)
    const other = await freeHouse(4)
    const made = await buy(h, 2)
    if (!made.ok) throw new Error(made.code)
    const done = await req('POST', `/api/box-office/baskets/${made.basket.orderId}/checkout`, { expectedTotalMinor: 0, email: `door${++guests}@example.org` }, null, { 'x-basket-token': made.basket.token })
    expect(done.body.state, JSON.stringify(done.body)).toBe('confirmed')
    const reference = done.body.reference as string
    expect((await scan(other, reference)).body).toMatchObject({ result: 'wrong_performance', scanId: null, ticketPerformance: { id: h.performanceId } })
    expect((await scan(h, reference.toLowerCase())).body).toEqual({ result: 'reference', scanId: null, reference })
    // Neither is a scan of a ticket, so neither writes a row.
    expect(await count('SELECT count(*) AS n FROM box_office_scans WHERE performance_id IN (?, ?)', h.performanceId, other.performanceId)).toBe(0)
  })

  it('counts who is in for the live door, and lists tonight\'s doors for whoever may admit', async () => {
    const h = await freeHouse(4)
    const codes = await tickets(h, 2)
    await scan(h, codes[0]!)
    const summary = await req('GET', `/api/box-office/performances/${h.performanceId}/door/summary`, undefined, steward)
    expect(summary.body).toMatchObject({ performance: { id: h.performanceId }, tickets: 2, admitted: 1, unpaid: 0 })
    expect((await req('GET', `/api/box-office/performances/${h.performanceId}/door/summary`, undefined, person([]))).status).toBe(403)

    // Tonight: performances today in the theatre's time zone. The house's performances are in March.
    const today = await house(4, { startsAt: NOV_16 + 6 * 3_600_000 })
    const tonight = (actor: ReturnType<typeof person>) => req('GET', '/api/box-office/door/tonight', undefined, actor)
    const ids = (await tonight(steward)).body.performances.map((p: { id: string }) => p.id)
    expect(ids).toContain(today.performanceId)
    expect(ids).not.toContain(h.performanceId)
    expect((await tonight(person([]))).body.performances).toEqual([])

    // The Tonight hub lists the day's performances with Box office's figures for whoever may admit.
    const hub = await req('GET', '/api/core/live/tonight', undefined, steward)
    expect(hub.status, JSON.stringify(hub.body)).toBe(200)
    const listed = hub.body.performances.find((p: { id: string }) => p.id === today.performanceId)
    expect(listed.figures).toEqual([
      expect.objectContaining({ id: 'box-office.sold', value: 0, state: 'ok' }),
      expect.objectContaining({ id: 'box-office.in', value: 0, to: `/live/door/${today.performanceId}` }),
    ])
    expect((await req('GET', '/api/core/live/tonight', undefined, person([]))).status).toBe(403)
  })

  it('keeps a late show at the door after midnight, until the theatre\'s day starts', async () => {
    // 22:30 in London, and the clock moved on to 01:00 the next morning.
    const late = await house(4, { startsAt: NOV_16 + 10.5 * 3_600_000 })
    try {
      setClock(NOV_16 + 13 * 3_600_000)
      const ids = (await req('GET', '/api/box-office/door/tonight', undefined, steward)).body.performances.map((p: { id: string }) => p.id)
      expect(ids).toContain(late.performanceId)
      setClock(NOV_16 + 17 * 3_600_000)
      expect((await req('GET', '/api/box-office/door/tonight', undefined, steward)).body.performances.map((p: { id: string }) => p.id)).not.toContain(late.performanceId)
    }
    finally {
      setClock(NOV_16)
    }
  })

  it('is for people who may admit', async () => {
    const h = await freeHouse(2)
    const [code] = await tickets(h, 1)
    expect((await scan(h, code!, undefined, person([]))).status).toBe(403)
    expect(await count('SELECT count(*) AS n FROM box_office_tickets WHERE performance_id = ? AND admitted_at IS NOT NULL', h.performanceId)).toBe(0)
  })
})

describe('the door offline', () => {
  const nextId = () => newId('scan')

  it('gives the device the keys, each ticket\'s code hash and each booking, for whoever may admit', async () => {
    const h = await freeHouse(4)
    const codes = await tickets(h, 2)
    await scan(h, codes[0]!)
    const pack = await req('GET', `/api/box-office/performances/${h.performanceId}/door/offline`, undefined, steward)
    expect(pack.status, JSON.stringify(pack.body)).toBe(200)
    expect(pack.body.keys.length).toBeGreaterThan(0)
    expect(pack.body.tickets).toHaveLength(2)
    expect(pack.body.tickets.filter((t: { in: boolean }) => t.in)).toHaveLength(1)
    expect(pack.body.bookings).toEqual([expect.objectContaining({ tickets: 2, admitted: 1 })])
    expect((await req('GET', `/api/box-office/performances/${h.performanceId}/door/offline`, undefined, person([]))).status).toBe(403)
  })

  it('takes admissions made offline at the device\'s time, once however often they are sent', async () => {
    const h = await freeHouse(4)
    const codes = await tickets(h, 3)
    const listed = await req('GET', `/api/box-office/performances/${h.performanceId}/door`, undefined, steward)
    const orderId = listed.body.rows[0].id as string
    const first = nextId()
    const second = nextId()
    const named = [nextId()]
    const items = [
      { kind: 'code', id: first, code: codes[0]!, at: NOV_16 - 60_000 },
      // Another device let the same ticket in first.
      { kind: 'code', id: second, code: codes[0]!, at: NOV_16 - 30_000 },
      { kind: 'name', ids: named, orderId, at: NOV_16 - 20_000 },
    ]
    const sent = await req('POST', `/api/box-office/performances/${h.performanceId}/door/offline`, { items, deviceLabel: 'Phone' }, steward)
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    expect(sent.body.results).toEqual([
      expect.objectContaining({ id: first, result: 'admitted' }),
      expect.objectContaining({ id: second, result: 'already_admitted' }),
      expect.objectContaining({ id: named[0], result: 'admitted', admitted: 1 }),
    ])
    expect(await rows('SELECT result, offline, scanned_at FROM box_office_scans WHERE id = ?', first)).toEqual([{ result: 'admitted', offline: 1, scanned_at: NOV_16 - 60_000 }])
    // Sent again after a lost answer: nothing more happens.
    const again = await req('POST', `/api/box-office/performances/${h.performanceId}/door/offline`, { items }, steward)
    expect(again.body.results.map((r: { result: string }) => r.result)).toEqual(['sent', 'sent', 'sent'])
    expect(await count('SELECT count(*) AS n FROM box_office_tickets WHERE performance_id = ? AND admitted_at IS NOT NULL', h.performanceId)).toBe(2)
    expect(await count('SELECT count(*) AS n FROM box_office_scans WHERE performance_id = ?', h.performanceId)).toBe(3)
  })
})

describe('the door list', () => {
  it('lists who is still to arrive, and moves them once every ticket is used', async () => {
    const h = await freeHouse(4)
    const codes = await tickets(h, 2)
    const waiting = await req('GET', `/api/box-office/performances/${h.performanceId}/door`, undefined, steward)
    expect(waiting.status).toBe(200)
    expect(waiting.body.rows).toHaveLength(1)
    expect(waiting.body.rows[0]).toMatchObject({ tickets: 2, admitted: 0 })
    await scan(h, codes[0]!)
    expect((await req('GET', `/api/box-office/performances/${h.performanceId}/door`, undefined, steward)).body.rows[0].admitted).toBe(1)
    await scan(h, codes[1]!)
    expect((await req('GET', `/api/box-office/performances/${h.performanceId}/door`, undefined, steward)).body.rows).toHaveLength(0)
    const everyone = await req('GET', `/api/box-office/performances/${h.performanceId}/door?view=all`, undefined, steward)
    expect(everyone.body.rows[0]).toMatchObject({ tickets: 2, admitted: 2 })
  })

  it('lists a reservation not yet paid for as Not paid, found by its reference, and never as arrived', async () => {
    const h = await house(4)
    const made = await buy(h, 2)
    if (!made.ok) throw new Error(made.code)
    const reserved = await req('POST', `/api/box-office/baskets/${made.basket.orderId}/reserve`, { expectedTotalMinor: made.basket.totalMinor, email: `door${++guests}@example.org` }, null, { 'x-basket-token': made.basket.token })
    expect(reserved.body.state, JSON.stringify(reserved.body)).toBe('reserved')
    const row = { reference: reserved.body.reference, tickets: 2, admitted: 0, unpaid: { amountDueMinor: made.basket.totalMinor, currency: 'GBP' } }
    expect((await req('GET', `/api/box-office/performances/${h.performanceId}/door`, undefined, steward)).body.rows).toEqual([expect.objectContaining(row)])
    expect((await req('GET', `/api/box-office/performances/${h.performanceId}/door?q=${reserved.body.reference}`, undefined, steward)).body.rows).toEqual([expect.objectContaining(row)])
    expect((await req('GET', `/api/box-office/performances/${h.performanceId}/door?arrived=yes`, undefined, steward)).body.rows).toHaveLength(0)
  })

  it('admits by name from the list, as many as asked, and never the same ticket twice', async () => {
    const h = await freeHouse(4)
    const codes = await tickets(h, 3)
    const listed = await req('GET', `/api/box-office/performances/${h.performanceId}/door`, undefined, steward)
    const orderId = listed.body.rows[0].id as string
    await scan(h, codes[2]!)
    const one = await req('POST', `/api/box-office/performances/${h.performanceId}/door/admit`, { orderId, count: 1 }, steward)
    expect(one.status).toBe(200)
    expect(one.body.admitted).toBe(1)
    const rest = await req('POST', `/api/box-office/performances/${h.performanceId}/door/admit`, { orderId, count: 5 }, steward)
    expect(rest.body.admitted).toBe(1)
    const again = await req('POST', `/api/box-office/performances/${h.performanceId}/door/admit`, { orderId, count: 1 }, steward)
    expect(again.body.admitted).toBe(0)
    expect((await req('GET', `/api/box-office/performances/${h.performanceId}/door?view=all`, undefined, steward)).body.rows[0]).toMatchObject({ tickets: 3, admitted: 3 })
  })

  it('finds a booking by its reference', async () => {
    const h = await freeHouse(4)
    await tickets(h, 1)
    const all = await req('GET', `/api/box-office/performances/${h.performanceId}/door?view=all`, undefined, steward)
    const reference = all.body.rows[0].reference as string
    const found = await req('GET', `/api/box-office/performances/${h.performanceId}/door?view=all&q=${reference}`, undefined, steward)
    expect(found.body.rows.map((r: { reference: string }) => r.reference)).toEqual([reference])
  })
})

describe('checking a requirement again at entry', () => {
  // A steward who may ask the members list about someone else, as Membership's card check allows.
  const checker = person(['box-office.ticket.admit', 'seats.members.look-up'])
  afterEach(() => setModule('seats', true))

  /** A free ticket of a type that needs membership, kept as met by `account` or by the typed number's evidence. */
  async function memberTicket(kept: { account?: string, evidence?: string, ref?: string }, recheckAtEntry = true): Promise<{ h: House, code: string }> {
    const h = await freeHouse(4)
    const [code] = await tickets(h, 1)
    const made = await req('POST', '/api/box-office/ticket-types', { name: `Member ${++guests}`, kind: 'standard', requirementRefs: ['seats:member'], recheckAtEntry })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    const ref = kept.ref ?? 'seats:member'
    await rows('UPDATE box_office_order_lines SET ticket_type_id = ?, requirement_ref = ?, requirement_account_id = ?, requirement_evidence_id = ? WHERE performance_id = ?', made.body.ticketTypeId, ref, kept.account ?? null, kept.evidence ?? null, h.performanceId)
    await rows('UPDATE box_office_tickets SET requirement_ref = ?, requirement_account_id = ?, requirement_evidence_id = ? WHERE performance_id = ?', ref, kept.account ?? null, kept.evidence ?? null, h.performanceId)
    return { h, code: code! }
  }
  const admittedIn = async (h: House) => count('SELECT count(*) AS n FROM box_office_tickets WHERE performance_id = ? AND admitted_at IS NOT NULL', h.performanceId)

  it('admits a current member, and turns away one whose membership has lapsed with the source\'s words', async () => {
    const holder = person([])
    members.add(holder.accountId!)
    const current = await memberTicket({ account: holder.accountId! })
    expect((await scan(current.h, current.code, undefined, checker)).body).toMatchObject({ result: 'admitted' })

    const lapsed = person([])
    const turned = await memberTicket({ account: lapsed.accountId! })
    const out = await scan(turned.h, turned.code, undefined, checker)
    expect(out.body).toMatchObject({ result: 'requirement_not_met', requirement: { reason: 'We could not find that membership.' } })
    expect(out.body.requirement.ticketType).toMatch(/^Member /)
    expect(await admittedIn(turned.h)).toBe(0)
    expect(await rows('SELECT result, unchecked FROM box_office_scans WHERE performance_id = ?', turned.h.performanceId)).toEqual([{ result: 'requirement_not_met', unchecked: 0 }])
    // Once sorted at the desk, as a member now, the same ticket goes in.
    members.add(lapsed.accountId!)
    expect((await scan(turned.h, turned.code, undefined, checker)).body.result).toBe('admitted')
  })

  it('does not ask again when the type does not recheck, unless the ticket was met by a typed number', async () => {
    const nobody = person([])
    const byAccount = await memberTicket({ account: nobody.accountId! }, false)
    expect((await scan(byAccount.h, byAccount.code, undefined, checker)).body.result).toBe('admitted')

    const byNumber = await memberTicket({ evidence: 'ev_forged' }, false)
    expect((await scan(byNumber.h, byNumber.code, undefined, checker)).body.result).toBe('requirement_not_met')
    const good = await memberTicket({ evidence: 'ev_member' }, false)
    expect((await scan(good.h, good.code, undefined, checker)).body).toMatchObject({ result: 'admitted' })
  })

  it('admits and marks the scan unchecked when the source is off, failing, or not open to this steward', async () => {
    const nobody = person([])
    const notOpen = await memberTicket({ account: nobody.accountId! })
    const plain = await scan(notOpen.h, notOpen.code)
    expect(plain.body).toMatchObject({ result: 'admitted', unchecked: true })

    const broken = await memberTicket({ account: nobody.accountId!, ref: 'seats:broken' })
    expect((await scan(broken.h, broken.code, undefined, checker)).body).toMatchObject({ result: 'admitted', unchecked: true })

    const off = await memberTicket({ account: nobody.accountId! })
    await setModule('seats', false)
    expect((await scan(off.h, off.code, undefined, checker)).body).toMatchObject({ result: 'admitted', unchecked: true })
    expect(await rows("SELECT unchecked FROM box_office_scans WHERE performance_id = ? AND result = 'admitted'", off.h.performanceId)).toEqual([{ unchecked: 1 }])
    // A second scan says Already in without asking again.
    expect((await scan(off.h, off.code, undefined, checker)).body.result).toBe('already_admitted')
  })

  it('lists each ticket admitted without the check on the night report, by booking and type', async () => {
    const nobody = person([])
    const off = await memberTicket({ account: nobody.accountId! })
    await setModule('seats', false)
    expect((await scan(off.h, off.code, undefined, checker)).body).toMatchObject({ result: 'admitted', unchecked: true })
    // Scanned again, it is still listed once.
    await scan(off.h, off.code, undefined, checker)
    const [{ reference }] = await rows<{ reference: string }>('SELECT o.reference FROM box_office_orders o JOIN box_office_order_lines l ON l.order_id = o.id WHERE l.performance_id = ? LIMIT 1', off.h.performanceId)
    const lines = await inContext(() => attendance.compile(off.h.performanceId))
    expect(lines.slice(0, 5)).toEqual([
      { label: 'box-office.report.tickets', value: 1 },
      { label: 'box-office.report.admitted', value: 1 },
      { label: 'box-office.report.not-in', value: 0 },
      { label: 'box-office.report.complimentary', value: 0 },
      { label: 'box-office.report.unchecked', value: 1 },
    ])
    expect(lines[5]).toMatchObject({ label: expect.stringMatching(new RegExp(`^${reference} · Member `)), value: expect.stringMatching(/^\d{2}:\d{2}$/) })
    expect(lines.slice(6)).toEqual([{ label: 'box-office.report.overridden', value: 0 }])
  })

  it('lets a holder of the override admit anyway, with a reason from the list, audited, never on their own booking', async () => {
    const supervisor = person(['box-office.ticket.admit', 'seats.members.look-up', 'box-office.ticket-type.override-requirement'])
    const reason = (await inContext(() => listTerms('box-office.override-reason'))).find(t => t.slug === 'membership-shown')!.id
    const lapsed = person([])
    const { h, code } = await memberTicket({ account: lapsed.accountId! })
    const override = (actor: ReturnType<typeof person>, body: Record<string, unknown>) => req('POST', `/api/box-office/performances/${h.performanceId}/door/override`, body, actor)

    // The plain steward is offered nothing; the supervisor is offered Admit anyway.
    expect((await scan(h, code, undefined, checker)).body.overridable).toBeUndefined()
    const out = await scan(h, code, undefined, supervisor)
    expect(out.body).toMatchObject({ result: 'requirement_not_met', overridable: true })

    expect((await override(checker, { ticketId: out.body.ticketId, reasonTermId: reason })).status).toBe(403)
    expect((await override(supervisor, { ticketId: out.body.ticketId, reasonTermId: 'term_nope' })).body.code).toBe('box-office.door.override-bad-reason')
    const done = await override(supervisor, { ticketId: out.body.ticketId, reasonTermId: reason })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body).toMatchObject({ result: 'admitted', booking: { admitted: 1 } })
    expect(await admittedIn(h)).toBe(1)
    expect(await rows("SELECT reason_term_id FROM box_office_scans WHERE performance_id = ? AND result = 'admitted_by_override'", h.performanceId)).toEqual([{ reason_term_id: reason }])
    expect(await count("SELECT count(*) AS n FROM core_audit WHERE ability = 'box-office.ticket-type.override-requirement' AND record_id = ?", h.performanceId)).toBe(1)
    expect((await override(supervisor, { ticketId: out.body.ticketId, reasonTermId: reason })).body.code).toBe('box-office.door.override-in')
    // The night report lists it with the reason chosen.
    const report = await inContext(() => attendance.compile(h.performanceId))
    expect(report.slice(-2)).toEqual([{ label: 'box-office.report.overridden', value: 1 }, { label: expect.stringMatching(/ · Member /), value: expect.stringMatching(/^\d{2}:\d{2} · Membership shown in person$/) }])

    // On the supervisor's own booking, nothing is offered and the route refuses.
    const own = await memberTicket({ account: supervisor.accountId! })
    await rows('UPDATE box_office_orders SET account_id = ? WHERE id IN (SELECT l.order_id FROM box_office_order_lines l WHERE l.performance_id = ?)', supervisor.accountId!, own.h.performanceId)
    const mine = await scan(own.h, own.code, undefined, supervisor)
    expect(mine.body).toMatchObject({ result: 'requirement_not_met' })
    expect(mine.body.overridable).toBeUndefined()
    const refused = await req('POST', `/api/box-office/performances/${own.h.performanceId}/door/override`, { ticketId: mine.body.ticketId, reasonTermId: reason }, supervisor)
    expect(refused.body.code).toBe('box-office.door.override-own')
  })
})

describe('showing a ticket again', () => {
  it('keeps the code sealed and signs it afresh, so the code shown later is admitted', async () => {
    const h = await freeHouse(4)
    const [issued] = await tickets(h, 1)
    const stored = (await rows<{ door_code: string, order_id: string }>('SELECT t.door_code, l.order_id FROM box_office_tickets t JOIN box_office_order_lines l ON l.id = t.order_line_id WHERE l.performance_id = ?', h.performanceId))[0]!
    const random = issued!.split('.')[2]!
    // Sealed: the code part is not in the row as it is.
    expect(stored.door_code).toBeTruthy()
    expect(stored.door_code).not.toContain(random)
    const shown = await inContext(() => doorCodesForOrder(stored.order_id))
    expect(shown).toHaveLength(1)
    expect(shown[0]).toMatchObject({ performanceId: h.performanceId, admitted: false })
    expect(shown[0]!.doorCode!.split('.')[2]).toBe(random)
    expect((await scan(h, shown[0]!.doorCode!)).body).toMatchObject({ result: 'admitted' })
    expect((await inContext(() => doorCodesForOrder(stored.order_id)))[0]).toMatchObject({ admitted: true })
  })

  it('shows no code for a ticket issued before codes were kept', async () => {
    const h = await freeHouse(4)
    await tickets(h, 1)
    await rows('UPDATE box_office_tickets SET door_code = NULL WHERE performance_id = ?', h.performanceId)
    const orderId = (await rows<{ order_id: string }>('SELECT order_id FROM box_office_order_lines WHERE performance_id = ?', h.performanceId))[0]!.order_id
    expect((await inContext(() => doorCodesForOrder(orderId)))[0]).toMatchObject({ doorCode: null })
  })
})
