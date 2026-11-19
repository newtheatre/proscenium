// The last seat (BO-13, BO-14; Box office specification, part 3, "A claim", and the proof): with
// many buyers pressing at once exactly one gets the last seat, a party is seated whole or not at
// all, a lapsed hold never blocks a sale, and the database itself refuses every way of overselling.
// The races run inside one isolate, where an unprotected design oversells.
import { beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { env, rows } from '../../../../tests/integration/helpers'
import { buy, house, NOV_16, ready, req, type House, type Outcome } from './stage'

const pool = async (h: House) => (await rows<{ id: string, capacity: number, claimed: number }>('SELECT id, capacity, claimed FROM box_office_pools WHERE performance_id = ?', h.performanceId))[0]!
const live = async (poolId: string) => (await rows<{ n: number }>("SELECT count(*) AS n FROM box_office_claims WHERE pool_id = ? AND state IN ('held', 'confirmed')", poolId))[0]!.n
const won = (outcomes: Outcome[]) => outcomes.filter(o => o.ok) as Extract<Outcome, { ok: true }>[]
const lost = (outcomes: Outcome[]) => outcomes.filter(o => !o.ok) as Extract<Outcome, { ok: false }>[]

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
})

describe('the last seat', () => {
  it('goes to exactly one of forty buyers pressing at once', async () => {
    const h = await house(1)
    const outcomes = await Promise.all(Array.from({ length: 40 }, () => buy(h, 1)))
    expect(won(outcomes)).toHaveLength(1)
    expect(new Set(lost(outcomes).map(o => o.code))).toEqual(new Set(['box-office.capacity.sold-out']))
    const p = await pool(h)
    expect(p.claimed).toBe(1)
    expect(await live(p.id)).toBe(1)
    // The losers left nothing behind: no order, hold, claim or line.
    expect(await rows('SELECT id FROM box_office_order_lines WHERE performance_id = ?', h.performanceId)).toHaveLength(1)
    expect((await rows<{ n: number }>('SELECT count(*) AS n FROM box_office_holds h JOIN box_office_claims c ON c.hold_id = h.id WHERE c.pool_id = ?', p.id))[0]!.n).toBe(1)
  })

  it('seats 300 parties of one to four in 120 seats with nobody partly seated', async () => {
    const h = await house(120)
    const sizes = Array.from({ length: 300 }, (_, i) => i % 4 + 1)
    const outcomes = await Promise.all(sizes.map(size => buy(h, size)))
    const seated = won(outcomes).reduce((sum, o) => sum + o.basket.lines.length, 0)
    const p = await pool(h)
    expect(p.claimed).toBe(seated)
    expect(await live(p.id)).toBe(seated)
    expect(seated).toBeLessThanOrEqual(120)
    // Whatever is left is too few for every party that was refused room... or nothing at all.
    expect(seated).toBeGreaterThan(116)
    // Every winner holds exactly the seats it asked for.
    for (const o of won(outcomes)) {
      const held = await rows('SELECT c.id FROM box_office_claims c JOIN box_office_holds h ON h.id = c.hold_id WHERE h.order_id = ?', o.basket.orderId)
      expect(held).toHaveLength(o.basket.lines.length)
    }
  }, 20_000)

  it('takes none for a party of four when three remain, and says three remain', async () => {
    const h = await house(3)
    const four = await buy(h, 4)
    expect(four).toMatchObject({ ok: false, code: 'box-office.capacity.not-enough' })
    expect((four as any).reason).toContain('Only 3 are left')
    expect((await pool(h)).claimed).toBe(0)
    expect(await buy(h, 3)).toMatchObject({ ok: true })
    expect((await pool(h)).claimed).toBe(3)
  })

  it('is resold once when the basket holding it has lapsed and nobody has swept', async () => {
    const h = await house(1)
    expect(await buy(h, 1)).toMatchObject({ ok: true })
    expect(await buy(h, 1)).toMatchObject({ ok: false, code: 'box-office.capacity.sold-out' })
    advanceClock(11 * 60_000)
    const outcomes = await Promise.all(Array.from({ length: 40 }, () => buy(h, 1)))
    expect(won(outcomes)).toHaveLength(1)
    const p = await pool(h)
    expect(p.claimed).toBe(1)
    expect(await rows("SELECT id FROM box_office_claims WHERE pool_id = ? AND state = 'released' AND release_reason = 'expired'", p.id)).toHaveLength(1)
    setClock(NOV_16)
  })

  it('holds across two bands together or not at all', async () => {
    const h = await house(5)
    const circle = await req('POST', `/api/box-office/productions/${h.productionId}/bands`, { name: 'Circle', sort: 1 })
    await req('PUT', `/api/box-office/performances/${h.performanceId}/sales`, { pools: [{ bandId: circle.body.bandId, capacity: 1 }] })
    await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: circle.body.bandId, ticketTypeId: h.fullId, amountMinor: 900 }] })
    const both = [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 2 }, { bandId: circle.body.bandId, ticketTypeId: h.fullId, quantity: 2 }]
    expect(await buy(h, 0, both)).toMatchObject({ ok: false, code: 'box-office.capacity.not-enough' })
    expect((await pool(h)).claimed).toBe(0)
    const fits = await buy(h, 0, [{ ...both[0]! }, { ...both[1]!, quantity: 1 }])
    expect(fits).toMatchObject({ ok: true, basket: { totalMinor: 2 * 1200 + 900 } })
  })
})

describe('the database itself', () => {
  it('refuses capacity below what is claimed, a revived claim, a deleted claim and a forced counter', async () => {
    const h = await house(2)
    const first = await buy(h, 2)
    expect(first.ok).toBe(true)
    const p = await pool(h)
    const claim = (await rows<{ id: string }>('SELECT id FROM box_office_claims WHERE pool_id = ?', p.id))[0]!.id
    const refused = async (sql: string, ...params: unknown[]) => {
      await expect(env.DB.prepare(sql).bind(...params).run()).rejects.toThrow()
    }
    await refused('UPDATE box_office_pools SET capacity = 1 WHERE id = ?', p.id)
    await refused('UPDATE box_office_pools SET claimed = 0 WHERE id = ?', p.id)
    await refused('DELETE FROM box_office_claims WHERE id = ?', claim)
    await refused("INSERT INTO box_office_claims (id, pool_id, hold_id, state, created_at) SELECT 'clm_extra', pool_id, hold_id, 'held', 0 FROM box_office_claims WHERE id = ?", claim)
    await env.DB.prepare("UPDATE box_office_claims SET state = 'released', released_at = 1, release_reason = 'staff' WHERE id = ?").bind(claim).run()
    expect((await pool(h)).claimed).toBe(1)
    await refused("UPDATE box_office_claims SET state = 'held', released_at = NULL, release_reason = NULL WHERE id = ?", claim)
    await refused("UPDATE box_office_claims SET pool_id = 'pool_other' WHERE id = ?", claim)
    expect((await pool(h)).claimed).toBe(1)
    expect(await live(p.id)).toBe(1)
  })
})
