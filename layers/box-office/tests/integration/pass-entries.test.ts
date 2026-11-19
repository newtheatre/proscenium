// Using a pass (BO-64): a pass's code adds one entry to a basket at no charge. Several passes go on
// one basket beside paid tickets; a pass covers only its shows, gives one entry a performance and,
// for its kind, one performance of a show; a pass in someone's name is theirs alone online; an
// entry goes back with its seat; and a basket left behind does not stand in its holder's way.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, nowMs, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import typesPost from '../../server/api/box-office/pass-types/index.post'
import passGet from '../../server/api/box-office/book/performances/[id]/pass.get'
import { basketByToken, createBasket, type Basket } from '../../server/baskets'
import { issuePass } from '../../server/pass-holding'
import { listPassTypes } from '../../server/passes'
import { passesFor } from '../../server/pass-entries'
import { passOf } from '../../server/orders'
import { expireBasket } from '../../server/release'
import { ensureManagedTicketTypes } from '../../server/ticket-types'
import { house, NOV_16, ready, type House } from './stage'

const handle = server({ 'POST /api/box-office/pass-types': typesPost, 'GET /api/box-office/book/performances/:id/pass': passGet })
const staff = person(['box-office.pass.manage'])
let keys = 0

let a: House
let b: House
let names = 0
async function passType(fields: Record<string, unknown> = {}) {
  const made = await call(handle, 'POST', '/api/box-office/pass-types', { actor: staff, headers: { 'idempotency-key': `pe${++keys}` }, body: { name: `Pass ${++names}`, covers: 'productions', productionIds: [a.productionId, b.productionId], perShow: 'once', prices: [{ name: 'Adult', amountMinor: 3500 }], ...fields } })
  const body = await made.json() as { id: string }
  expect(made.status, JSON.stringify(body)).toBe(200)
  return (await inContext(() => listPassTypes())).find(t => t.id === body.id)!
}
async function issue(type: Awaited<ReturnType<typeof passType>>, options: { accountId?: string | null, paid?: boolean } = {}) {
  return inContext(async () => {
    const unit = createUnit()
    const pass = await issuePass(unit.view(), { passTypeId: type.id, passPriceId: type.prices[0]!.id, accountId: options.accountId ?? null, paid: options.paid ?? true, issuedBy: null })
    await unit.commit()
    return pass
  })
}
type Result = ({ ok: true } & Basket) | { ok: false, code: string, reason: string }
async function hold(h: House, codes: string[], full = 0, actor?: ReturnType<typeof person>): Promise<Result> {
  try {
    const basket = await inContext(async () => {
      const unit = createUnit()
      const made = await createBasket(unit.view(), { performanceId: h.performanceId, lines: full ? [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: full }] : [], passes: codes.map(code => ({ code })) })
      await unit.commit()
      return made
    }, actor)
    return { ok: true, ...basket }
  }
  catch (error: any) {
    if (error?.name !== 'Refusal') throw error
    return { ok: false, code: error.code, reason: error.reason }
  }
}
const taken = async (passId: string) => (await rows<{ uses_taken: number }>('SELECT uses_taken FROM box_office_passes WHERE id = ?', passId))[0]!.uses_taken
const expire = (orderId: string, at: number) => inContext(async () => {
  const unit = createUnit()
  expireBasket(unit.view(), orderId, at)
  await unit.commit()
})

// Moves a basket on, as reserving or paying would, so its entries are no longer a basket's.
const keep = (orderId: string) => env.DB.prepare("UPDATE box_office_orders SET state = 'confirmed', expires_at = NULL, account_id = 'acc_test' WHERE id = ?").bind(orderId).run()

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  a = await house(30)
  b = await house(30)
  await inContext(() => ensureManagedTicketTypes())
})

describe('a pass on a basket', () => {
  it('adds one entry at no charge, beside paid tickets, and two passes give two entries', async () => {
    const type = await passType()
    const one = await issue(type)
    const two = await issue(type)
    const basket = await hold(a, [one.code, two.code.toLowerCase().replace(/-/g, ' ')], 1)
    if (!basket.ok) throw new Error(basket.reason)
    expect(basket.totalMinor).toBe(1200)
    const lines = await rows<{ list_minor: number, amount_minor: number, entry: number }>('SELECT list_minor, amount_minor, pass_redemption_id IS NOT NULL AS entry FROM box_office_order_lines WHERE order_id = ? ORDER BY amount_minor DESC, id', basket.orderId)
    expect(lines).toEqual([{ list_minor: 1200, amount_minor: 1200, entry: 0 }, { list_minor: 0, amount_minor: 0, entry: 1 }, { list_minor: 0, amount_minor: 0, entry: 1 }])
    expect([await taken(one.id), await taken(two.id)]).toEqual([1, 1])
    // The basket names each entry by its pass.
    const seen = await inContext(() => basketByToken(basket.orderId, basket.token))
    expect(seen!.lines.filter(l => l.pass).map(l => l.pass)).toEqual([type.name, type.name])
    // A basket that lapses gives the entries back.
    await expire(basket.orderId, basket.expiresAt + 1)
    expect([await taken(one.id), await taken(two.id)]).toEqual([0, 0])
  })

  it('is refused for a show it does not cover, an unknown code, and the same pass twice', async () => {
    const type = await passType({ productionIds: [b.productionId] })
    const pass = await issue(type)
    expect(await hold(a, [pass.code])).toMatchObject({ ok: false, code: 'box-office.pass.not-covered' })
    expect(await hold(a, ['PASS-ZZZZ-ZZZZ'])).toMatchObject({ ok: false, code: 'box-office.pass.unknown' })
    expect(await hold(b, [pass.code, pass.code])).toMatchObject({ ok: false, code: 'box-office.pass.repeated' })
    expect(await taken(pass.id)).toBe(0)
  })

  it('gives one performance of each show, and no more than its entries in all', async () => {
    const second = await house(30)
    const type = await passType({ productionIds: [a.productionId, b.productionId, second.productionId], uses: 2 })
    const pass = await issue(type)
    const first = await hold(a, [pass.code])
    if (!first.ok) throw new Error(first.reason)
    // Reserved, so it is no longer only a basket.
    await keep(first.orderId)
    expect(await hold(a, [pass.code])).toMatchObject({ ok: false, code: 'box-office.pass.used-here' })
    const next = await hold(b, [pass.code])
    if (!next.ok) throw new Error(next.reason)
    // The basket left behind is let go when the holder chooses again: still one entry for the show.
    const again = await hold(b, [pass.code])
    expect(again.ok).toBe(true)
    expect((await rows<{ state: string }>('SELECT state FROM box_office_orders WHERE id = ?', next.orderId))[0]!.state).toBe('expired')
    expect(await taken(pass.id)).toBe(2)
    if (again.ok) await keep(again.orderId)
    expect(await hold(second, [pass.code])).toMatchObject({ ok: false, code: 'box-office.pass.used-up' })
  })

  it('in one person\'s name is theirs alone online, and is offered to them without typing', async () => {
    const holder = person([], { accountId: 'acc_holder' })
    const type = await passType({ holder: 'named' })
    const pass = await issue(type, { accountId: 'acc_holder' })
    expect(await hold(a, [pass.code])).toMatchObject({ ok: false, code: 'box-office.pass.sign-in' })
    expect(await hold(a, [pass.code], 0, person([], { accountId: 'acc_other' }))).toMatchObject({ ok: false, code: 'box-office.pass.not-yours' })
    const offered = await inContext(() => passesFor(a.performanceId, 'acc_holder'))
    expect(offered).toMatchObject({ accepted: true, mine: [{ code: pass.code, name: type.name, priceName: 'Adult', unusable: null }] })
    expect((await hold(a, [pass.code], 0, holder)).ok).toBe(true)
    // Nobody else is told whose passes cover a show, only that passes are taken.
    expect(await inContext(() => passesFor(a.performanceId, null))).toEqual({ accepted: true, mine: [] })
  })

  it('not paid for brings what is owed for it onto the booking', async () => {
    const owed = await issue(await passType(), { paid: false })
    expect(await hold(a, [owed.code])).toMatchObject({ ok: true, totalMinor: 3500 })
  })

  it('is tried before anything is held', async () => {
    const pass = await issue(await passType())
    const tried = await call(handle, 'GET', `/api/box-office/book/performances/${a.performanceId}/pass?code=${encodeURIComponent(pass.code)}`, {})
    expect(await tried.json()).toMatchObject({ code: pass.code, priceName: 'Adult', owedMinor: 0 })
    const bad = await call(handle, 'GET', `/api/box-office/book/performances/${a.performanceId}/pass?code=PASS-AAAA-BBBB`, {})
    expect([bad.status, (await bad.json() as { code: string }).code]).toEqual([422, 'box-office.pass.unknown'])
    expect(nowMs()).toBe(NOV_16)
  })
})

describe('an order booked on a pass', () => {
  it('names the pass for staff, says whether the pass is paid, and whether every ticket came from it', async () => {
    const type = await passType()
    const pass = await issue(type)
    const only = await hold(b, [pass.code])
    if (!only.ok) throw new Error(only.code)
    await keep(only.orderId)
    expect(await inContext(() => passOf(only.orderId))).toEqual({ name: type.name, paid: true, only: true })

    await env.DB.prepare('UPDATE box_office_passes SET paid_at = NULL WHERE id = ?').bind(pass.id).run()
    expect(await inContext(() => passOf(only.orderId))).toEqual({ name: type.name, paid: false, only: true })

    const other = await issue(type)
    const mixed = await hold(a, [other.code], 1)
    if (!mixed.ok) throw new Error(mixed.code)
    expect((await inContext(() => passOf(mixed.orderId)))?.only).toBe(false)

    const none = await hold(a, [], 1)
    if (!none.ok) throw new Error(none.code)
    expect(await inContext(() => passOf(none.orderId))).toBeNull()
  })
})
