// Seating layouts and wheelchair spaces (show walkthrough, decisions 5, 6 and 10; Box office
// specification, part 3, "Wheelchair spaces", and the test plan's "Wheelchair spaces and companions"):
// a layout of a space counts its wheelchair spaces and the seats each takes; booking a space takes
// one space and its seats in one batch or nothing; the seats of unbooked spaces are kept from
// ordinary sale until the keep-back time; and cancelling, releasing or letting a basket go puts the
// seats back with the space.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import layoutsGet from '../../server/api/box-office/seating-layouts/index.get'
import layoutsPost from '../../server/api/box-office/seating-layouts/index.post'
import layoutPut from '../../server/api/box-office/seating-layouts/[id].put'
import layoutDelete from '../../server/api/box-office/seating-layouts/[id].delete'
import layoutUsual from '../../server/api/box-office/seating-layouts/[id]/usual.post'
import performanceLayoutGet from '../../server/api/box-office/performances/[id]/layout.get'
import performanceLayoutPut from '../../server/api/box-office/performances/[id]/layout.put'
import runLayoutGet from '../../server/api/box-office/productions/[id]/layout.get'
import runLayoutPut from '../../server/api/box-office/productions/[id]/layout.put'
import { availability } from '../../server/availability'
import { createBasket } from '../../server/baskets'
import { buy, house, manager, NOV_16, ready, req, type House } from './stage'

const handle = server({
  'GET /api/box-office/seating-layouts': layoutsGet,
  'POST /api/box-office/seating-layouts': layoutsPost,
  'PUT /api/box-office/seating-layouts/:id': layoutPut,
  'DELETE /api/box-office/seating-layouts/:id': layoutDelete,
  'POST /api/box-office/seating-layouts/:id/usual': layoutUsual,
  'GET /api/box-office/performances/:id/layout': performanceLayoutGet,
  'PUT /api/box-office/performances/:id/layout': performanceLayoutPut,
  'GET /api/box-office/productions/:id/layout': runLayoutGet,
  'PUT /api/box-office/productions/:id/layout': runLayoutPut,
})
let keys = 0
async function api<T = any>(method: string, path: string, body?: unknown, actor: ReturnType<typeof person> = manager): Promise<{ status: number, body: T }> {
  const headers = method === 'GET' ? {} : { 'idempotency-key': `lay${++keys}` }
  const response = await call(handle, method, path, { actor, body, headers })
  return { status: response.status, body: await response.json() as T }
}

const HOUR = 3_600_000
const count = async (sql: string, ...params: unknown[]) => (await rows<{ n: number }>(sql, ...params))[0]!.n
const spaceOf = async (h: House) => (await rows<{ space_id: string }>('SELECT space_id FROM core_performances WHERE id = ?', h.performanceId))[0]!.space_id
/** Each pool of the performance, by its band's kind: seats and wheelchair spaces. */
async function pools(h: House) {
  const all = await rows<{ id: string, kind: string, band_id: string, capacity: number, claimed: number }>(
    'SELECT o.id, b.kind, o.band_id, o.capacity, o.claimed FROM box_office_pools o JOIN box_office_bands b ON b.id = o.band_id WHERE o.performance_id = ?', h.performanceId)
  return { seats: all.find(p => p.kind === 'standard')!, spaces: all.find(p => p.kind === 'wheelchair') }
}
/** What is free of each kind, as the booking page and the desk are told. */
const free = async (h: House) => Object.fromEntries((await inContext(() => availability(h.performanceId))).bands.map(b => [b.kind, b.free]))

async function set(key: string, value: unknown): Promise<void> {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), key as any, value as any, { reason: 'test', confirm: true })
    await unit.commit()
  })
}

/** Someone signed in whose access scheme application says they stay in their wheelchair. */
async function wheelchairUser() {
  const holder = person([])
  await rows('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, \'Wheelchair User\', \'self\', ?, ?)', holder.accountId, NOV_16, NOV_16)
  const [stays] = await rows<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'core.access-need' AND slug = 'wheelchair-stays'")
  const scheme = await import('../../../core/server/identity/access-scheme')
  await inContext(async () => {
    const unit = createUnit()
    await scheme.apply(unit.view(), holder, holder.accountId!, { needs: [{ term: stays!.id }], companions: 0 })
    await unit.commit()
  }, holder)
  return holder
}

let wheelchairType: string
/** A wheelchair space booked by `holder` (a new wheelchair user when left out), straight through the service. */
async function bookSpace(h: House, holder?: ReturnType<typeof person>, quantity = 1) {
  const who = holder ?? await wheelchairUser()
  const { spaces } = await pools(h)
  try {
    const basket = await inContext(async () => {
      const unit = createUnit()
      const made = await createBasket(unit.view(), { performanceId: h.performanceId, lines: [{ bandId: spaces!.band_id, ticketTypeId: wheelchairType, quantity }] })
      await unit.commit()
      return made
    }, who)
    return { ok: true as const, basket, holder: who }
  }
  catch (error: any) {
    if (error?.name !== 'Refusal') throw error
    return { ok: false as const, code: error.code as string, holder: who }
  }
}

/** A layout for the performance's space, which, being the space's first, is its usual one and is applied. */
async function layout(h: House, numbers: { seats?: number | null, wheelchairSpaces: number, seatsPerSpace: number }, name = 'End-on') {
  const made = await api('POST', '/api/box-office/seating-layouts', { spaceId: await spaceOf(h), name, seats: numbers.seats ?? null, wheelchairSpaces: numbers.wheelchairSpaces, seatsPerSpace: numbers.seatsPerSpace })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body.id as string
}

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await inContext(async () => (await import('../../../core/server/vocabularies/service')).ensureVocabularies())
  // Listing the ticket types makes those the modules keep.
  const listed = await req<{ ticketTypes: { id: string, managedBy: string | null }[] }>('GET', '/api/box-office/ticket-types')
  wheelchairType = listed.body.ticketTypes.find(t => t.managedBy === 'box-office.wheelchair')!.id
})

describe('a seating layout', () => {
  it('is its space\'s usual layout when it is the first, and gives a performance already set up its wheelchair spaces', async () => {
    const h = await house(10)
    const id = await layout(h, { wheelchairSpaces: 2, seatsPerSpace: 2 })
    const listed = await api('GET', '/api/box-office/seating-layouts')
    expect(listed.body.rows.find((l: { id: string }) => l.id === id)).toMatchObject({ name: 'End-on', usual: true, wheelchairSpaces: 2, seatsPerSpace: 2 })
    const { spaces } = await pools(h)
    expect(spaces).toMatchObject({ capacity: 2, claimed: 0 })
    const shown = await api('GET', `/api/box-office/performances/${h.performanceId}/layout`)
    expect(shown.body).toMatchObject({ layoutId: id, wheelchair: { spaces: 2, booked: 0, seatsEach: 2, section: 'Stalls', kept: 4 } })
    // The space is offered at the lowest price anyone can have, and needs no price of its own to go on sale.
    const sales = await req('GET', `/api/box-office/performances/${h.performanceId}/sales`)
    expect(sales.body.checklist.every((i: { done: boolean }) => i.done)).toBe(true)
    expect(sales.body.bands.map((b: { kind: string }) => b.kind)).toEqual(['standard'])
    const found = await inContext(() => availability(h.performanceId))
    expect(found.bands.find(b => b.kind === 'wheelchair')!.prices).toEqual([{ ticketTypeId: wheelchairType, amountMinor: 800 }])
    // The production's Tickets tab shows the seats only.
    const tickets = await req('GET', `/api/box-office/productions/${h.productionId}/tickets`)
    expect(tickets.body.sections.map((s: { name: string }) => s.name)).toEqual(['Stalls'])
  })

  it('is chosen for one performance, which takes its spaces and, sold as one part of the house, its seats', async () => {
    const h = await house(10)
    await layout(h, { wheelchairSpaces: 2, seatsPerSpace: 2 })
    const round = await layout(h, { seats: 8, wheelchairSpaces: 4, seatsPerSpace: 1 }, 'In the round')
    const chosen = await api('PUT', `/api/box-office/performances/${h.performanceId}/layout`, { use: 'layout', layoutId: round })
    expect(chosen.status, JSON.stringify(chosen.body)).toBe(200)
    expect(await pools(h)).toMatchObject({ seats: { capacity: 8 }, spaces: { capacity: 4 } })
    expect((await api('GET', `/api/box-office/performances/${h.performanceId}/layout`)).body).toMatchObject({ layoutId: round, wheelchair: { spaces: 4, seatsEach: 1 } })
  })

  it('keeps its name to its space, cannot be cut below the spaces booked, and is not deleted while a performance uses it', async () => {
    const h = await house(10)
    const id = await layout(h, { wheelchairSpaces: 2, seatsPerSpace: 2 })
    expect((await api('POST', '/api/box-office/seating-layouts', { spaceId: await spaceOf(h), name: 'end-on', seats: null, wheelchairSpaces: 1, seatsPerSpace: 1 })).body.code).toBe('box-office.layout.name-taken')
    expect((await bookSpace(h)).ok).toBe(true)
    expect((await bookSpace(h)).ok).toBe(true)
    const cut = await api('PUT', `/api/box-office/seating-layouts/${id}`, { spaceId: await spaceOf(h), name: 'End-on', seats: null, wheelchairSpaces: 1, seatsPerSpace: 2 })
    expect(cut.body.code).toBe('box-office.layout.spaces-booked')
    expect((await api('DELETE', `/api/box-office/seating-layouts/${id}`, {})).body.code).toBe('box-office.layout.in-use')
    const raised = await api('PUT', `/api/box-office/seating-layouts/${id}`, { spaceId: await spaceOf(h), name: 'End-on', seats: null, wheelchairSpaces: 3, seatsPerSpace: 2 })
    expect(raised.status, JSON.stringify(raised.body)).toBe(200)
    expect((await pools(h)).spaces).toMatchObject({ capacity: 3, claimed: 2 })
  })
})

/** A second performance of the same production in the same space, set up for sale with `capacity` seats. */
async function another(h: House, capacity = 10): Promise<House> {
  const [at] = await rows<{ venue_id: string, space_id: string }>('SELECT venue_id, space_id FROM core_performances WHERE id = ?', h.performanceId)
  const made = await req('POST', `/api/core/productions/${h.productionId}/performances`, { venueId: at!.venue_id, spaceId: at!.space_id, startsAt: Date.UTC(2027, 3, 2, 19, 30), capacity: 500 })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  expect((await req('POST', `/api/core/performances/${made.body.id}/schedule`, {})).status).toBe(200)
  const sales = await req('PUT', `/api/box-office/performances/${made.body.id}/sales`, { pools: [{ bandId: h.bandId, capacity }] })
  expect(sales.status, JSON.stringify(sales.body)).toBe(200)
  return { ...h, performanceId: made.body.id }
}

describe('a run\'s wheelchair spaces', () => {
  it('are numbers typed in on the Tickets tab, given to every performance, which a performance can override', async () => {
    const h = await house(10)
    const second = await another(h)
    const run = await api('PUT', `/api/box-office/productions/${h.productionId}/layout`, { use: 'numbers', wheelchairSpaces: 3, seatsPerSpace: 1 })
    expect(run.status, JSON.stringify(run.body)).toBe(200)
    expect((await pools(h)).spaces).toMatchObject({ capacity: 3 })
    expect((await pools(second)).spaces).toMatchObject({ capacity: 3 })
    expect((await api('GET', `/api/box-office/productions/${h.productionId}/layout`)).body).toMatchObject({ choice: { layoutId: null, wheelchairSpaces: 3, seatsPerSpace: 1 }, ownCount: 0 })
    // Booking a space takes the one seat the run says each takes.
    expect((await bookSpace(h)).ok).toBe(true)
    expect(await pools(h)).toMatchObject({ seats: { claimed: 1 }, spaces: { claimed: 1 } })

    // One night has its own numbers; the run changing leaves it as it is.
    const own = await api('PUT', `/api/box-office/performances/${second.performanceId}/layout`, { use: 'numbers', wheelchairSpaces: 1, seatsPerSpace: 2 })
    expect(own.status, JSON.stringify(own.body)).toBe(200)
    expect((await pools(second)).spaces).toMatchObject({ capacity: 1 })
    expect((await api('PUT', `/api/box-office/productions/${h.productionId}/layout`, { use: 'numbers', wheelchairSpaces: 4, seatsPerSpace: 1 })).status).toBe(200)
    expect((await pools(h)).spaces).toMatchObject({ capacity: 4 })
    expect((await pools(second)).spaces).toMatchObject({ capacity: 1 })
    expect((await api('GET', `/api/box-office/performances/${second.performanceId}/layout`)).body).toMatchObject({
      own: { layoutId: null, wheelchairSpaces: 1, seatsPerSpace: 2 }, inherited: { wheelchairSpaces: 4, seatsPerSpace: 1, from: 'run' }, wheelchair: { spaces: 1, seatsEach: 2 },
    })
    // Handed back, it takes the run's again.
    expect((await api('PUT', `/api/box-office/performances/${second.performanceId}/layout`, { use: 'inherit' })).status).toBe(200)
    expect((await pools(second)).spaces).toMatchObject({ capacity: 4 })
    expect((await api('GET', `/api/box-office/performances/${second.performanceId}/layout`)).body).toMatchObject({ own: null, wheelchair: { spaces: 4, seatsEach: 1 } })
  })

  it('is a layout of the space chosen for the run, refused below the spaces booked, and goes back to the usual one', async () => {
    const h = await house(10)
    await layout(h, { wheelchairSpaces: 2, seatsPerSpace: 2 })
    const round = await layout(h, { wheelchairSpaces: 4, seatsPerSpace: 1 }, 'In the round')
    expect((await api('PUT', `/api/box-office/productions/${h.productionId}/layout`, { use: 'layout', layoutId: round })).status).toBe(200)
    expect((await api('GET', `/api/box-office/performances/${h.performanceId}/layout`)).body).toMatchObject({ layoutId: round, own: null, inherited: { name: 'In the round', from: 'run' } })
    expect((await pools(h)).spaces).toMatchObject({ capacity: 4 })
    for (let i = 0; i < 3; i++) expect((await bookSpace(h)).ok).toBe(true)
    const cut = await api('PUT', `/api/box-office/productions/${h.productionId}/layout`, { use: 'inherit' })
    expect(cut.body.code).toBe('box-office.layout.spaces-booked')
    expect((await pools(h)).spaces).toMatchObject({ capacity: 4, claimed: 3 })
  })

  it('leaves a run with no choice on its space\'s usual layout', async () => {
    const h = await house(10)
    const usual = await layout(h, { wheelchairSpaces: 2, seatsPerSpace: 2 })
    const round = await layout(h, { wheelchairSpaces: 4, seatsPerSpace: 1 }, 'In the round')
    expect((await api('PUT', `/api/box-office/productions/${h.productionId}/layout`, { use: 'layout', layoutId: round })).status).toBe(200)
    expect((await api('PUT', `/api/box-office/productions/${h.productionId}/layout`, { use: 'inherit' })).status).toBe(200)
    expect((await api('GET', `/api/box-office/performances/${h.performanceId}/layout`)).body).toMatchObject({ layoutId: usual, inherited: { from: 'usual' } })
    expect((await pools(h)).spaces).toMatchObject({ capacity: 2 })
    expect((await api('GET', `/api/box-office/productions/${h.productionId}/layout`)).body).toMatchObject({ choice: null })
  })
})

describe('booking a wheelchair space', () => {
  it('takes one space and the seats it takes the place of, in one batch, and counts one person', async () => {
    const h = await house(10)
    await layout(h, { wheelchairSpaces: 2, seatsPerSpace: 2 })
    expect(await free(h)).toEqual({ standard: 6, wheelchair: 2 })
    const booked = await bookSpace(h)
    expect(booked.ok, JSON.stringify(booked)).toBe(true)
    const { seats, spaces } = await pools(h)
    expect(spaces).toMatchObject({ claimed: 1 })
    expect(seats).toMatchObject({ claimed: 2 })
    const orderId = (booked as { basket: { orderId: string } }).basket.orderId
    expect(await count("SELECT count(*) AS n FROM box_office_claims c JOIN box_office_order_lines l ON l.claim_id = c.displaced_for_id WHERE l.order_id = ? AND c.pool_id = ? AND c.state = 'held'", orderId, seats.id)).toBe(2)
    expect(await count('SELECT count(*) AS n FROM box_office_order_lines WHERE order_id = ?', orderId)).toBe(1)
    // 2 seats for the space booked, 2 kept back for the other: 6 left for anyone.
    expect(await free(h)).toEqual({ standard: 6, wheelchair: 1 })
  })

  it('keeps the seats of unbooked spaces from ordinary tickets until the keep-back time', async () => {
    const h = await house(10)
    await layout(h, { wheelchairSpaces: 2, seatsPerSpace: 2 })
    expect(await buy(h, 7)).toMatchObject({ ok: false, code: 'box-office.capacity.kept-for-wheelchair' })
    expect((await buy(h, 6)).ok).toBe(true)
    expect(await buy(h, 1)).toMatchObject({ ok: false, code: 'box-office.capacity.kept-for-wheelchair' })
    // The kept seats are there for the spaces.
    expect((await bookSpace(h)).ok).toBe(true)
    expect((await bookSpace(h)).ok).toBe(true)
    expect(await bookSpace(h)).toMatchObject({ ok: false, code: 'box-office.capacity.sold-out' })
    expect(await pools(h)).toMatchObject({ seats: { capacity: 10, claimed: 10 }, spaces: { capacity: 2, claimed: 2 } })
  })

  it('lets the kept seats go on general sale once the keep-back time has come', async () => {
    const h = await house(10, { startsAt: NOV_16 + 20 * HOUR })
    await layout(h, { wheelchairSpaces: 2, seatsPerSpace: 2 })
    expect(await free(h)).toEqual({ standard: 10, wheelchair: 2 })
    // At most 8 to an order.
    expect((await buy(h, 5)).ok).toBe(true)
    expect((await buy(h, 4)).ok).toBe(true)
    // One seat left: a space needs two, so it is not offered, and booking one takes nothing.
    expect(await free(h)).toEqual({ standard: 1, wheelchair: 0 })
    expect(await bookSpace(h)).toMatchObject({ ok: false, code: 'box-office.capacity.wheelchair-gone' })
    expect(await pools(h)).toMatchObject({ seats: { claimed: 9 }, spaces: { claimed: 0 } })
  })

  it('keeps nothing back with the setting at nought', async () => {
    await set('box-office.wheelchair.keep-seats-before', 0)
    try {
      const h = await house(10)
      await layout(h, { wheelchairSpaces: 2, seatsPerSpace: 2 })
      expect((await buy(h, 5)).ok).toBe(true)
      expect((await buy(h, 5)).ok).toBe(true)
      expect(await bookSpace(h)).toMatchObject({ ok: false, code: 'box-office.capacity.wheelchair-gone' })
    }
    finally {
      await set('box-office.wheelchair.keep-seats-before', 86400)
    }
  })

  it('touches no seat where the spaces are kept apart from the seats', async () => {
    const h = await house(10)
    await layout(h, { wheelchairSpaces: 3, seatsPerSpace: 0 }, 'Cabaret')
    expect(await free(h)).toEqual({ standard: 10, wheelchair: 3 })
    expect((await bookSpace(h)).ok).toBe(true)
    expect(await pools(h)).toMatchObject({ seats: { claimed: 0 }, spaces: { claimed: 1 } })
    expect((await buy(h, 5)).ok).toBe(true)
    expect((await buy(h, 5)).ok).toBe(true)
  })

  it('is not offered where the layout has no wheelchair spaces', async () => {
    const h = await house(10)
    await layout(h, { wheelchairSpaces: 0, seatsPerSpace: 2 })
    expect(await free(h)).toEqual({ standard: 10 })
  })
})

describe('the seats a space takes', () => {
  it('go back on sale with the space when a reservation of it is cancelled or released', async () => {
    const h = await house(10)
    await layout(h, { wheelchairSpaces: 2, seatsPerSpace: 2 })
    for (const how of ['cancel', 'release'] as const) {
      const booked = await bookSpace(h)
      if (!booked.ok) throw new Error(booked.code)
      const b = booked.basket
      const reserved = await req('POST', `/api/box-office/baskets/${b.orderId}/reserve`, { expectedTotalMinor: b.totalMinor, ageConfirmed: true }, booked.holder, { 'x-basket-token': b.token })
      expect(reserved.body.state, JSON.stringify(reserved.body)).toBe('reserved')
      expect(await pools(h)).toMatchObject({ seats: { claimed: 2 }, spaces: { claimed: 1 } })
      expect(await count("SELECT count(*) AS n FROM box_office_claims WHERE displaced_for_id IS NOT NULL AND state = 'confirmed' AND pool_id = ?", (await pools(h)).seats.id)).toBe(2)
      const done = how === 'cancel'
        ? await req('POST', `/api/box-office/orders/${b.orderId}/cancel`, { refund: 'none' }, person(['box-office.order.cancel']))
        : await req('POST', `/api/box-office/orders/${b.orderId}/release`, {}, person(['box-office.order.release']))
      expect(done.status, JSON.stringify(done.body)).toBe(200)
      expect(await pools(h)).toMatchObject({ seats: { claimed: 0 }, spaces: { claimed: 0 } })
      expect(await count("SELECT count(*) AS n FROM box_office_claims WHERE displaced_for_id IS NOT NULL AND state <> 'released' AND pool_id = ?", (await pools(h)).seats.id)).toBe(0)
    }
  })

  it('go back with the space when its basket is let go or runs out, and resell', async () => {
    const h = await house(4, { startsAt: NOV_16 + 20 * HOUR })
    await layout(h, { wheelchairSpaces: 1, seatsPerSpace: 2 })
    const booked = await bookSpace(h)
    if (!booked.ok) throw new Error(booked.code)
    const gone = await req('POST', `/api/box-office/baskets/${booked.basket.orderId}/release`, {}, null, { 'x-basket-token': booked.basket.token })
    expect(gone.status, JSON.stringify(gone.body)).toBe(200)
    expect(await pools(h)).toMatchObject({ seats: { claimed: 0 }, spaces: { claimed: 0 } })
    // A space held in a basket that runs out: the next buyer of seats has them.
    expect((await bookSpace(h)).ok).toBe(true)
    expect(await buy(h, 4)).toMatchObject({ ok: false })
    setClock(NOV_16 + HOUR)
    try {
      expect((await buy(h, 4)).ok).toBe(true)
      expect(await pools(h)).toMatchObject({ seats: { claimed: 4 }, spaces: { claimed: 0 } })
    }
    finally {
      setClock(NOV_16)
    }
  })
})
