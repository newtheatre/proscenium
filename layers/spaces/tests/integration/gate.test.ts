// The gate (SP-01 to SP-04): two confirmed bookings can never overlap in one bookable, whether each
// is a new booking, a decision on a request or a move (rule C2, proof runs P-1 to P-5); performances
// and closures block the time on the write itself (P-7, rules C1 items 2 and 3); and every state move
// is one guarded update with its history row and its event (the moves table).
import { beforeAll, describe, expect, it } from 'vitest'
import { rows } from '../../../../tests/integration/helpers'
import { changeTime, confirmRequest, insertBooking, moveBooking, type Bookable } from '../../server/bookings'
import { at, attempt, bookable, booking, coreReq, member, place, purpose, ready } from './stage'

beforeAll(ready)

const ask = (b: Bookable, purposeId: string, startsAt: number, endsAt: number, state: 'confirmed' | 'requested' = 'confirmed', who = member()) => {
  let id = ''
  const result = attempt((unit) => { id = insertBooking(unit, { bookable: b, purposeId, startsAt, endsAt, state, bookedFor: who, requestedBy: who, title: 'Rehearsal' }, who) })
  return result.then(outcome => ({ outcome, id }))
}

const confirmed = (bookableId: string) => rows<{ id: string, starts_at: number, ends_at: number }>("SELECT id, starts_at, ends_at FROM spaces_bookings WHERE bookable_id = ? AND state = 'confirmed' ORDER BY starts_at", bookableId)

describe('the write that cannot double-book (C2)', () => {
  it('P-1: of fifty identical bookings made at once, one is confirmed and the rest are refused as a clash', async () => {
    const room = await bookable(await place())
    const p = await purpose()
    const outcomes = await Promise.all(Array.from({ length: 50 }, () => ask(room, p, at(14), at(16))))
    expect(outcomes.filter(o => o.outcome === 'ok')).toHaveLength(1)
    expect(outcomes.filter(o => o.outcome === 'spaces.clash')).toHaveLength(49)
    expect(await confirmed(room.id)).toHaveLength(1)
  })

  it('P-2: of fifty bookings each overlapping its neighbour by one slot, no two confirmed overlap and at least half stand', async () => {
    const room = await bookable(await place())
    const p = await purpose()
    const slot = 15 * 60_000
    await Promise.all(Array.from({ length: 50 }, (_, i) => ask(room, p, at(8) + i * slot, at(8) + (i + 2) * slot)))
    const held = await confirmed(room.id)
    for (let i = 1; i < held.length; i++) expect(held[i]!.starts_at).toBeGreaterThanOrEqual(held[i - 1]!.ends_at)
    expect(held.length).toBeGreaterThanOrEqual(25)
  })

  it('P-3: twenty requests for one window, all confirmed at once: one stands and nineteen stay requested', async () => {
    const room = await bookable(await place())
    const p = await purpose(5, { approval: 'approval' })
    const asked = await Promise.all(Array.from({ length: 20 }, () => ask(room, p, at(18), at(20), 'requested')))
    expect(asked.every(a => a.outcome === 'ok')).toBe(true)
    const decider = member()
    const decisions = await Promise.all(asked.map(async a => attempt(async unit => confirmRequest(unit, await booking(a.id), room, decider))))
    expect(decisions.filter(d => d === 'ok')).toHaveLength(1)
    expect(decisions.filter(d => d === 'spaces.clash')).toHaveLength(19)
    expect(await rows('SELECT state, count(*) AS n FROM spaces_bookings WHERE bookable_id = ? GROUP BY state ORDER BY state', room.id)).toEqual([{ state: 'confirmed', n: 1 }, { state: 'requested', n: 19 }])
  })

  it('P-4: a booking moved into a window while another is made there: one holds it, and a loser keeps its old time', async () => {
    const room = await bookable(await place())
    const p = await purpose()
    const moving = await ask(room, p, at(9), at(10))
    const before = await booking(moving.id)
    const [moved, made] = await Promise.all([
      attempt(unit => changeTime(unit, before, { bookable: room, startsAt: at(12), endsAt: at(13) }, before.bookedFor)),
      ask(room, p, at(12), at(13)),
    ])
    expect([moved, made.outcome].filter(o => o === 'ok')).toHaveLength(1)
    const held = await confirmed(room.id)
    expect(held.filter(b => b.starts_at === at(12))).toHaveLength(1)
    if (moved !== 'ok') expect(held.find(b => b.id === moving.id)).toMatchObject({ starts_at: at(9), ends_at: at(10) })
  })

  it('P-5: back-to-back windows made at once are both confirmed', async () => {
    const room = await bookable(await place())
    const p = await purpose()
    const [a, b] = await Promise.all([ask(room, p, at(14), at(15)), ask(room, p, at(15), at(16))])
    expect([a.outcome, b.outcome]).toEqual(['ok', 'ok'])
  })

  it('a request takes no time: two may ask for the same window (C4)', async () => {
    const room = await bookable(await place())
    const p = await purpose(5, { approval: 'approval' })
    await ask(room, p, at(10), at(12))
    expect((await ask(room, p, at(10), at(12), 'requested')).outcome).toBe('ok')
    expect((await ask(room, p, at(11), at(13), 'requested')).outcome).toBe('ok')
  })

  it('a clash in one bookable leaves another free', async () => {
    const one = await bookable(await place())
    const two = await bookable(await place())
    const p = await purpose()
    expect((await ask(one, p, at(10), at(12))).outcome).toBe('ok')
    expect((await ask(two, p, at(10), at(12))).outcome).toBe('ok')
  })
})

describe('performances and closures always win (C1, SP-03)', () => {
  it('P-7: a booking over a scheduled performance in the space is refused on the write; a draft blocks nothing', async () => {
    const venue = await place()
    const room = await bookable(venue)
    const p = await purpose()
    const production = await coreReq('POST', '/api/core/productions', { title: 'Twelfth Night', kind: 'own' })
    const show = await coreReq('POST', `/api/core/productions/${production.body.id}/performances`, { venueId: venue.venueId, spaceId: venue.spaceId, startsAt: at(14) })
    expect(show.status, JSON.stringify(show.body)).toBe(200)
    expect((await ask(room, p, at(14), at(15))).outcome).toBe('ok')
    expect((await coreReq('POST', `/api/core/performances/${show.body.id}/schedule`, {})).status).toBe(200)
    expect((await ask(room, p, at(15), at(16))).outcome).toBe('spaces.clash')
    expect((await ask(room, p, at(9), at(11))).outcome).toBe('ok')
  })

  it('refuses a booking over a closure of the venue or the whole theatre, and allows one over a public holiday', async () => {
    const venue = await place()
    const room = await bookable(venue)
    const p = await purpose()
    expect((await coreReq('POST', '/api/core/closures', { venueId: venue.venueId, title: 'Rewiring', allDay: false, from: '2027-01-13T09:00', to: '2027-01-13T17:00' })).status).toBe(200)
    expect((await ask(room, p, at(24 + 10), at(24 + 11))).outcome).toBe('spaces.clash')
    expect((await coreReq('POST', '/api/core/closures', { title: 'Staff training', allDay: false, from: '2027-01-14T09:00', to: '2027-01-14T12:00' })).status).toBe(200)
    expect((await ask(room, p, at(48 + 10), at(48 + 11))).outcome).toBe('spaces.clash')
    await rows('INSERT INTO core_closures (id, kind, title, starts_at, ends_at, all_day, blocks_performances, source, created_at) VALUES (\'clo_holiday\', \'public_holiday\', \'Holiday\', ?, ?, 1, 0, \'feed\', ?)', at(72), at(96), Date.now())
    expect((await ask(room, p, at(72 + 10), at(72 + 11))).outcome).toBe('ok')
  })

  it('blocks a resource by a closure of its home venue or the whole theatre, never of another venue', async () => {
    const home = await place()
    const elsewhere = await place()
    const van = await bookable({ resource: `Van ${home.venueId}`, homeVenueId: home.venueId })
    const p = await purpose()
    await coreReq('POST', '/api/core/closures', { venueId: elsewhere.venueId, title: 'Elsewhere', allDay: false, from: '2027-01-20T09:00', to: '2027-01-20T17:00' })
    expect((await ask(van, p, at(8 * 24 + 10), at(8 * 24 + 11))).outcome).toBe('ok')
    await coreReq('POST', '/api/core/closures', { venueId: home.venueId, title: 'Home', allDay: false, from: '2027-01-21T09:00', to: '2027-01-21T17:00' })
    expect((await ask(van, p, at(9 * 24 + 10), at(9 * 24 + 11))).outcome).toBe('spaces.clash')
  })
})

describe('state moves (SP-04)', () => {
  it('writes one history row and one event for each move', async () => {
    const room = await bookable(await place())
    const p = await purpose()
    const made = await ask(room, p, at(10), at(11))
    expect(await rows('SELECT kind FROM spaces_booking_events WHERE booking_id = ?', made.id)).toEqual([{ kind: 'confirmed' }])
    expect(await rows('SELECT name, payload FROM core_events WHERE record_id = ?', made.id)).toMatchObject([{ name: 'spaces.booking.confirmed' }])
    const b = await booking(made.id)
    expect(await attempt(unit => moveBooking(unit, b, { to: 'cancelled', actor: b.bookedFor, reason: 'by-booker', payload: { reason: 'by-booker', late: false } }))).toBe('ok')
    expect(await rows('SELECT kind FROM spaces_booking_events WHERE booking_id = ? ORDER BY at, id', made.id)).toEqual([{ kind: 'confirmed' }, { kind: 'cancelled' }])
    expect(await rows('SELECT state, closed_reason FROM spaces_bookings WHERE id = ?', made.id)).toEqual([{ state: 'cancelled', closed_reason: 'by-booker' }])
    // The time is free the moment it is cancelled (rule X4).
    expect((await ask(room, p, at(10), at(11))).outcome).toBe('ok')
  })

  it('refuses a move the table does not allow, and of two people acting at once only one succeeds', async () => {
    const room = await bookable(await place())
    const p = await purpose(5, { approval: 'approval' })
    const made = await ask(room, p, at(15), at(16), 'requested')
    const b = await booking(made.id)
    expect(await attempt(unit => moveBooking(unit, b, { to: 'cancelled', actor: null }))).toBe('spaces.booking.wrong-state')
    const both = await Promise.all([
      attempt(unit => moveBooking(unit, b, { to: 'withdrawn', actor: b.bookedFor })),
      attempt(unit => moveBooking(unit, b, { to: 'declined', actor: member(), note: 'No' })),
    ])
    expect(both.filter(o => o === 'ok')).toHaveLength(1)
    expect(await rows('SELECT count(*) AS n FROM spaces_booking_events WHERE booking_id = ?', made.id)).toEqual([{ n: 2 }])
  })

  it('copies the tier from the purpose, so a later change to the purpose leaves the booking alone (L6)', async () => {
    const room = await bookable(await place())
    const p = await purpose(3)
    const made = await ask(room, p, at(11), at(12))
    await rows('UPDATE spaces_purposes SET tier = 7 WHERE id = ?', p)
    expect((await booking(made.id)).tier).toBe(3)
  })
})
