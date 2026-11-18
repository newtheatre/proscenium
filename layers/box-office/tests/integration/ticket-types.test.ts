// Ticket types (Box office specification, part 2; BO-18, BO-20, BO-62): a module declares the types
// it needs and Box office keeps them, locked to their rules; people make ordinary types, edit, retire,
// order and delete unused ones; complimentary tickets are never priced or sold; and a type with
// requirements is sold only to someone who meets them, within the holder's limit, online and at the desk.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { env } from 'cloudflare:test'
import { inContext, person, rows, server, call, setModule } from '../../../../tests/integration/helpers'
import ticketTypesGet from '../../server/api/box-office/ticket-types/index.get'
import ticketTypesPost from '../../server/api/box-office/ticket-types/index.post'
import ticketTypePatch from '../../server/api/box-office/ticket-types/[id].patch'
import ticketTypeDelete from '../../server/api/box-office/ticket-types/[id].delete'
import ticketTypeOrder from '../../server/api/box-office/ticket-types/order.put'
import bookGet from '../../server/api/box-office/book/performances/[id].get'
import holderPost from '../../server/api/box-office/desk/holder.post'
import { signDoorCode } from '../../server/door-codes'
import { findOrCreateAccount } from '#modules/core'
import { createBasket, pricedLines } from '../../server/baskets'
import { scheme as memberScheme, req as membershipReq } from '../../../membership/tests/integration/stage'
import { house, manager, NOV_16, ready, req, type House } from './stage'

const handle = server({
  'GET /api/box-office/ticket-types': ticketTypesGet,
  'POST /api/box-office/ticket-types': ticketTypesPost,
  'PATCH /api/box-office/ticket-types/:id': ticketTypePatch,
  'DELETE /api/box-office/ticket-types/:id': ticketTypeDelete,
  'PUT /api/box-office/ticket-types/order': ticketTypeOrder,
  'GET /api/box-office/book/performances/:id': bookGet,
  'POST /api/box-office/desk/holder': holderPost,
})
let keys = 0
async function api<T = any>(method: string, path: string, body?: unknown, actor: ReturnType<typeof person> | null = manager): Promise<{ status: number, body: T }> {
  const headers = method === 'GET' ? {} : { 'idempotency-key': `tt${++keys}` }
  const response = await call(handle, method, path, { actor: actor ?? undefined, body, headers })
  return { status: response.status, body: await response.json() as T }
}

interface Listed { id: string, name: string, kind: string, managedBy: string | null, available: boolean, active: boolean, used: boolean, requirementRefs: string[], channel: string }
const publisher = person(['core.production.edit', 'core.production.publish'])
/** Gives the production what publishing asks for, then publishes it. */
async function publish(h: House) {
  await inContext(async () => (await import('../../../core/server/vocabularies/service')).ensureVocabularies())
  const category = (await rows<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'core.production-category' AND slug = 'play'"))[0]!.id
  expect((await req('PATCH', `/api/core/productions/${h.productionId}`, { summary: 'A play to book for.', categoryTermId: category, effectsConfirmedNone: true, advisoriesConfirmedNone: true }, publisher)).status).toBe(200)
  expect((await req('POST', `/api/core/productions/${h.productionId}/publish`, {}, publisher)).status).toBe(200)
}

const list = async () => (await api<{ ticketTypes: Listed[] }>('GET', '/api/box-office/ticket-types')).body.ticketTypes
const managed = async (key: string) => (await list()).find(t => t.managedBy === key)!

/** One buyer's basket, as `actor`, straight through the service. */
async function buy(h: House, ticketTypeId: string, quantity: number, actor?: ReturnType<typeof person>, extra: { ticketTypeId: string, quantity: number }[] = []) {
  try {
    return await inContext(async () => {
      const unit = createUnit()
      const made = await createBasket(unit.view(), { performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId, quantity }, ...extra.map(e => ({ bandId: h.bandId, ...e }))] })
      await unit.commit()
      return { ok: true as const, orderId: made.orderId }
    }, actor)
  }
  catch (error: any) {
    if (error?.name !== 'Refusal') throw error
    return { ok: false as const, code: error.code as string, reason: error.reason as string }
  }
}

async function member(): Promise<ReturnType<typeof person>> {
  const id = await memberScheme()
  expect((await membershipReq('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })).status).toBe(200)
  const added = await membershipReq('POST', `/api/membership/schemes/${id}/members`, { address: `m${Math.random().toString(36).slice(2)}@example.org`, name: 'Grace Hopper' })
  expect(added.status, JSON.stringify(added.body)).toBe(200)
  return person([], { accountId: added.body.accountId })
}

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await setModule('membership', true)
  // Makes the shared Full price and Concession types first.
  await house(1)
})

describe('ticket types a module keeps', () => {
  it('are made for the modules that are on, locked to their rules, and cannot be made by hand', async () => {
    const types = await list()
    expect(types.find(t => t.managedBy === 'box-office.companion')).toMatchObject({ kind: 'companion', requirementRefs: ['core.access-scheme:companions'], available: true })
    expect(types.find(t => t.managedBy === 'box-office.complimentary')).toMatchObject({ kind: 'complimentary' })
    expect(types.find(t => t.managedBy === 'membership.member')).toMatchObject({ name: 'Member', requirementRefs: ['membership:any'] })
    expect((await api('POST', '/api/box-office/ticket-types', { name: 'My comps', kind: 'complimentary' })).status).toBe(422)

    const companion = await managed('box-office.companion')
    expect((await api('PATCH', `/api/box-office/ticket-types/${companion.id}`, { requirementRefs: [] })).body).toMatchObject({ code: 'box-office.ticket-type.managed' })
    expect((await api('PATCH', `/api/box-office/ticket-types/${companion.id}`, { name: 'Essential companion', sort: 5 })).status).toBe(200)
    expect((await managed('box-office.companion')).name).toBe('Essential companion')
    expect((await api('DELETE', `/api/box-office/ticket-types/${companion.id}`, {})).body).toMatchObject({ code: 'box-office.ticket-type.in-use' })
  })

  it('are listed as not sold while their module is off', async () => {
    await setModule('membership', false)
    const types = await list()
    expect(types.find(t => t.managedBy === 'membership.member')).toMatchObject({ available: false })
    await setModule('membership', true)
  })
})

describe('ticket types a person makes', () => {
  it('can be renamed, retired, brought back, and deleted only while unused', async () => {
    const made = await api('POST', '/api/box-office/ticket-types', { name: 'Under 16', kind: 'concession', sort: 3 })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    const id = made.body.ticketTypeId as string
    expect((await api('PATCH', `/api/box-office/ticket-types/${id}`, { name: 'Under 18' })).status).toBe(200)
    expect((await api('PATCH', `/api/box-office/ticket-types/${id}`, { active: false })).status).toBe(200)
    expect((await list()).find(t => t.id === id)).toMatchObject({ name: 'Under 18', active: false, used: false })
    expect((await api('PATCH', `/api/box-office/ticket-types/${id}`, { requirementRefs: ['nothing:here'] })).body).toMatchObject({ code: 'box-office.ticket-type.unknown-requirement' })
    expect((await api('DELETE', `/api/box-office/ticket-types/${id}`, {})).status).toBe(200)
    expect((await list()).some(t => t.id === id)).toBe(false)
  })

  it('are put in the order dragged, a new one goes last, and an order from a stale screen is refused', async () => {
    const made = await api('POST', '/api/box-office/ticket-types', { name: 'Last in' })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    const before = await list()
    expect(before.at(-1)!.id).toBe(made.body.ticketTypeId)
    const reversed = before.map(t => t.id).reverse()
    expect((await api('PUT', '/api/box-office/ticket-types/order', { ticketTypeIds: reversed })).status).toBe(200)
    expect((await list()).map(t => t.id)).toEqual(reversed)
    expect((await api('PUT', '/api/box-office/ticket-types/order', { ticketTypeIds: reversed.slice(1) })).body).toMatchObject({ code: 'box-office.ticket-type.order-stale' })
    expect((await api('PUT', '/api/box-office/ticket-types/order', { ticketTypeIds: [reversed[0], ...reversed.slice(0, -1)] })).body).toMatchObject({ code: 'box-office.ticket-type.order-stale' })
    expect((await api('PUT', '/api/box-office/ticket-types/order', { ticketTypeIds: reversed }, person([]))).status).toBe(403)
    expect((await list()).map(t => t.id)).toEqual(reversed)
  })

  it('refuses a name another type has, whatever its capitals', async () => {
    expect((await api('POST', '/api/box-office/ticket-types', { name: 'full PRICE' })).body).toMatchObject({ code: 'box-office.ticket-type.name-taken' })
  })
})

describe('complimentary tickets', () => {
  it('are never priced, so they cannot be bought', async () => {
    const h = await house(10)
    const comp = await managed('box-office.complimentary')
    const priced = await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: comp.id, amountMinor: 0 }] })
    expect(priced.body).toMatchObject({ code: 'box-office.price.complimentary' })
    // Even a price row left from before this rule does not make them sellable.
    await rows('INSERT INTO box_office_prices (id, production_id, band_id, ticket_type_id, amount_minor, currency, effective_from, created_at) VALUES (?, ?, ?, ?, 0, \'GBP\', ?, ?) RETURNING id', `prc_${'a'.repeat(26)}`, h.productionId, h.bandId, comp.id, NOV_16 - 1, NOV_16)
    expect(await buy(h, comp.id, 2)).toMatchObject({ ok: false, code: 'box-office.price.none' })
  })
})

describe('a member price', () => {
  async function memberHouse() {
    const h = await house(20)
    const type = await managed('membership.member')
    expect((await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: type.id, amountMinor: 500 }] })).status).toBe(200)
    return { h, type }
  }

  it('is sold to a current member, one per performance, and kept on the line', async () => {
    const { h, type } = await memberHouse()
    const holder = await member()
    const first = await buy(h, type.id, 1, holder)
    expect(first.ok, JSON.stringify(first)).toBe(true)
    const [line] = await rows<{ requirement_ref: string, requirement_account_id: string }>('SELECT requirement_ref, requirement_account_id FROM box_office_order_lines WHERE order_id = ?', (first as { orderId: string }).orderId)
    expect(line).toEqual({ requirement_ref: 'membership:any', requirement_account_id: holder.accountId })
    // Starting again in another browser lets the first basket go rather than counting it (B18).
    const again = await buy(h, type.id, 1, holder)
    expect(again.ok, JSON.stringify(again)).toBe(true)
    const firstId = (first as { orderId: string }).orderId
    expect(await rows('SELECT state FROM box_office_orders WHERE id = ?', firstId)).toEqual([{ state: 'expired' }])
    expect(await rows('SELECT DISTINCT c.state, c.release_reason FROM box_office_claims c JOIN box_office_holds k ON k.id = c.hold_id WHERE k.order_id = ?', firstId)).toEqual([{ state: 'released', release_reason: 'abandoned' }])
    // A ticket the member has beyond a basket still counts.
    const kept = (again as { orderId: string }).orderId
    await rows("UPDATE box_office_claims SET state = 'confirmed', expires_at = NULL WHERE hold_id IN (SELECT id FROM box_office_holds WHERE order_id = ?)", kept)
    await rows("UPDATE box_office_orders SET state = 'reserved', expires_at = NULL, account_id = ? WHERE id = ?", holder.accountId, kept)
    expect(await buy(h, type.id, 1, holder)).toMatchObject({ ok: false, code: 'box-office.requirement.limit' })
    expect(await buy(h, type.id, 2, await member())).toMatchObject({ ok: false, code: 'box-office.requirement.limit' })
  })

  it('is refused to someone who is not a member or not signed in, and offered to them as not met', async () => {
    const { h, type } = await memberHouse()
    expect(await buy(h, type.id, 1, person([]))).toMatchObject({ ok: false, code: 'box-office.requirement.not-met' })
    expect(await buy(h, type.id, 1)).toMatchObject({ ok: false, code: 'box-office.requirement.not-met' })
    await publish(h)
    const page = await api('GET', `/api/box-office/book/performances/${h.performanceId}`, undefined, person([]))
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    expect(page.body.bands[0].types.find((t: { ticketTypeId: string }) => t.ticketTypeId === type.id)).toMatchObject({ unmet: 'This price is for members.' })
    // General prices come first, then those for people who qualify.
    const restricted = page.body.bands[0].types.map((t: { unmet?: string }) => !!t.unmet) as boolean[]
    expect(restricted).toContain(false)
    expect(restricted).toEqual([...restricted].sort((a, b) => Number(a) - Number(b)))
    const mine = await api('GET', `/api/box-office/book/performances/${h.performanceId}`, undefined, await member())
    expect(mine.body.bands[0].types.find((t: { ticketTypeId: string }) => t.ticketTypeId === type.id)).toMatchObject({ most: 1 })
    // Only the Wheelchair space, which every show offers, is out of a member's reach here.
    expect(mine.body.bands[0].types.filter((t: { unmet?: string }) => t.unmet).map((t: { name: string }) => t.name)).toEqual(['Wheelchair space'])
  })

  it('is sold at the desk to the holder named, by their card or found by name, and by hand only to someone named', async () => {
    const { h, type } = await memberHouse()
    const holder = await member()
    const [membership] = await rows<{ id: string }>('SELECT id FROM membership_memberships WHERE account_id = ?', holder.accountId)
    const card = await inContext(() => signDoorCode('mem', membership!.id))
    const { accountId: stranger } = await inContext(async () => {
      const unit = createUnit()
      const made = await findOrCreateAccount(unit.view(), { address: `s${Math.random().toString(36).slice(2)}@example.org`, name: 'Not A Member', origin: 'guest' })
      await unit.commit()
      return made
    })
    // Asking about somebody else's membership is Membership's card check.
    const seller = person(['box-office.order.sell', 'membership.card.check'])
    const supervisor = person(['box-office.order.sell', 'membership.card.check', 'box-office.ticket-type.override-requirement'])
    const priced = (holders: string[] | undefined, actor: ReturnType<typeof person>) => inContext(async () => {
      try {
        return (await pricedLines(h.performanceId, [{ bandId: h.bandId, ticketTypeId: type.id, quantity: holders?.length ?? 1, ...(holders ? { holders } : {}) }], Date.now(), { channel: 'desk', account: null })).lines
      }
      catch (error: any) {
        if (error?.name !== 'Refusal') throw error
        return error.code as string
      }
    }, actor)

    const byCard = await api('POST', '/api/box-office/desk/holder', { performanceId: h.performanceId, ticketTypeId: type.id, code: card }, seller)
    expect(byCard.status, JSON.stringify(byCard.body)).toBe(200)
    expect(byCard.body).toMatchObject({ accountId: holder.accountId, label: 'Grace Hopper', met: true, mayOverride: false })
    expect(await priced([holder.accountId!], seller)).toMatchObject([{ amountMinor: 500, requirement: { ref: 'membership:any', accountId: holder.accountId } }])
    // Nobody named: refused even to someone who may check by hand.
    expect(await priced(undefined, supervisor)).toBe('box-office.requirement.holder')

    const byName = await api('POST', '/api/box-office/desk/holder', { performanceId: h.performanceId, ticketTypeId: type.id, accountId: stranger }, seller)
    expect(byName.body).toMatchObject({ accountId: stranger, met: false, mayOverride: false })
    expect((await api('POST', '/api/box-office/desk/holder', { performanceId: h.performanceId, ticketTypeId: type.id, accountId: stranger }, supervisor)).body).toMatchObject({ met: false, mayOverride: true })
    expect(await priced([stranger], seller)).toBe('box-office.requirement.desk')
    // Checked by hand: sold to the person named, with nothing to check again at the door.
    expect(await priced([stranger], supervisor)).toMatchObject([{ requirement: { ref: null, accountId: stranger } }])

    expect((await api('POST', '/api/box-office/desk/holder', { performanceId: h.performanceId, ticketTypeId: type.id, code: 'mem.k.x.y' }, seller)).body).toMatchObject({ code: 'box-office.desk.card-unknown' })
    expect((await api('POST', '/api/box-office/desk/holder', { performanceId: h.performanceId, ticketTypeId: type.id, code: card }, person([]))).status).toBe(403)
    // A seller who may not ask about members is told so, rather than that the member does not qualify.
    expect((await api('POST', '/api/box-office/desk/holder', { performanceId: h.performanceId, ticketTypeId: type.id, code: card }, person(['box-office.order.sell']))).body).toMatchObject({ met: false, reason: expect.any(String) })
  })

  it('is withheld while Membership is off', async () => {
    const { h, type } = await memberHouse()
    const holder = await member()
    await setModule('membership', false)
    expect(await buy(h, type.id, 1, holder)).toMatchObject({ ok: false, code: 'box-office.price.none' })
    await setModule('membership', true)
  })
})

describe('a member price by reference', () => {
  /** A member of a scheme that takes a reference, with their member number. */
  async function referenced() {
    const id = await memberScheme({ acceptsReference: true })
    expect((await membershipReq('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })).status).toBe(200)
    const added = await membershipReq('POST', `/api/membership/schemes/${id}/members`, { address: `r${Math.random().toString(36).slice(2)}@example.org`, name: 'Ada Reference' })
    expect(added.status, JSON.stringify(added.body)).toBe(200)
    const mine = await membershipReq('GET', '/api/membership/mine', undefined, person([], { accountId: added.body.accountId }))
    return { accountId: added.body.accountId as string, membershipId: added.body.membershipId as string, number: mine.body.number.label as string }
  }
  async function memberHouse() {
    const h = await house(20)
    const type = await managed('membership.member')
    expect((await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: type.id, amountMinor: 500 }] })).status).toBe(200)
    return { h, type }
  }
  /** A basket bought without signing in, giving references for the member tickets. */
  async function buyWith(h: House, ticketTypeId: string, references: string[], actor?: ReturnType<typeof person>) {
    try {
      return await inContext(async () => {
        resetRateLimits()
        const unit = createUnit()
        const made = await createBasket(unit.view(), { performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId, quantity: references.length, references }] })
        await unit.commit()
        return { ok: true as const, orderId: made.orderId }
      }, actor)
    }
    catch (error: any) {
      if (error?.name !== 'Refusal') throw error
      return { ok: false as const, code: error.code as string, reason: error.reason as string }
    }
  }

  it('is sold for a member number typed in place of signing in, kept on the line, and once per performance', async () => {
    const { h, type } = await memberHouse()
    const m = await referenced()
    const first = await buyWith(h, type.id, [m.number])
    expect(first.ok, JSON.stringify(first)).toBe(true)
    const [line] = await rows<{ requirement_evidence_id: string, requirement_account_id: string, amount_minor: number }>('SELECT requirement_evidence_id, requirement_account_id, amount_minor FROM box_office_order_lines WHERE order_id = ?', (first as { orderId: string }).orderId)
    expect(line).toEqual({ requirement_evidence_id: m.membershipId, requirement_account_id: m.accountId, amount_minor: 500 })
    expect(await buyWith(h, type.id, [m.number])).toMatchObject({ ok: false, code: 'box-office.requirement.reference-used' })
  })

  it('refuses a reference given twice in one basket, and one that matches nobody, in the source\'s words', async () => {
    const { h, type } = await memberHouse()
    const m = await referenced()
    expect(await buyWith(h, type.id, [m.number, m.number])).toMatchObject({ ok: false, code: 'box-office.requirement.reference-used' })
    expect(await buyWith(h, type.id, ['M-999999'])).toMatchObject({ ok: false, code: 'box-office.requirement.reference-not-met', reason: expect.stringContaining('Have a membership? Contact us.') })
  })

  it('is sold at the desk on the buyer\'s reference by a seller who may not check by hand', async () => {
    const { h, type } = await memberHouse()
    const m = await referenced()
    const seller = person(['box-office.order.sell'])
    const priced = (references?: string[]) => inContext(async () => {
      resetRateLimits()
      try {
        return (await pricedLines(h.performanceId, [{ bandId: h.bandId, ticketTypeId: type.id, quantity: 1, ...(references ? { references } : {}) }], Date.now(), { channel: 'desk', account: null })).lines
      }
      catch (error: any) {
        if (error?.name !== 'Refusal') throw error
        return error.code as string
      }
    }, seller)
    expect(await priced()).toBe('box-office.requirement.holder')
    expect(await priced([m.number])).toMatchObject([{ amountMinor: 500, requirement: { ref: 'membership:any', evidence: m.membershipId, accountId: m.accountId } }])
  })

  it('is offered on the booking page with the scheme\'s own words for the reference', async () => {
    const { h, type } = await memberHouse()
    await referenced()
    await publish(h)
    const page = await api('GET', `/api/box-office/book/performances/${h.performanceId}`, undefined, person([]))
    expect(page.body.bands[0].types.find((t: { ticketTypeId: string }) => t.ticketTypeId === type.id)).toMatchObject({ unmet: 'This price is for members.', reference: { label: expect.stringMatching(/: type your (member number|membership reference or member number) to get this price$/), field: expect.stringMatching(/^(Member number|Membership reference)$/) } })
  })
})

describe('a companion ticket', () => {
  it('is refused to someone not on the access scheme, even beside a paid ticket', async () => {
    const h = await house(20)
    const companion = await managed('box-office.companion')
    expect((await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: companion.id, amountMinor: 0 }] })).status).toBe(200)
    const buyer = person([])
    expect(await buy(h, h.fullId, 1, buyer, [{ ticketTypeId: companion.id, quantity: 1 }])).toMatchObject({ ok: false, code: 'box-office.requirement.not-met' })
    expect((await buy(h, h.fullId, 1, buyer)).ok).toBe(true)
  })
})

describe('a wheelchair space', () => {
  /** Someone signed in who has applied to the access scheme saying they stay in their wheelchair. */
  async function wheelchairUser(holder?: ReturnType<typeof person>, decided = false) {
    if (!holder) {
      holder = person([])
      await rows('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, \'Wheelchair User\', \'self\', ?, ?)', holder.accountId, NOV_16, NOV_16)
    }
    const [stays] = await rows<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'core.access-need' AND slug = 'wheelchair-stays'")
    const scheme = await import('../../../core/server/identity/access-scheme')
    await inContext(async () => {
      const unit = createUnit()
      await scheme.apply(unit.view(), holder!, holder!.accountId!, { needs: [{ term: stays!.id }], companions: 0 })
      await unit.commit()
    }, holder)
    if (decided) {
      const reviewer = person(['core.access-scheme.review'])
      await inContext(async () => {
        const unit = createUnit()
        await scheme.decide(unit.view(), reviewer, holder!.accountId!, { action: 'accept' })
        await unit.commit()
      }, reviewer)
    }
    return holder
  }
  const evidence = async (orderId: string) => (await rows<{ requirement_evidence_id: string | null }>('SELECT requirement_evidence_id FROM box_office_order_lines WHERE order_id = ?', orderId)).map(r => r.requirement_evidence_id)

  it('is kept by Box office and costs the lowest price open to everyone, with no price of its own', async () => {
    const h = await house(20)
    const wheelchair = await managed('box-office.wheelchair')
    expect(wheelchair).toMatchObject({ name: 'Wheelchair space', requirementRefs: ['core.access-scheme:wheelchair'] })
    const holder = await wheelchairUser(undefined, true)
    const bought = await buy(h, wheelchair.id, 1, holder)
    expect(bought.ok, JSON.stringify(bought)).toBe(true)
    const [line] = await rows<{ amount_minor: number }>('SELECT amount_minor FROM box_office_order_lines WHERE order_id = ?', (bought as { orderId: string }).orderId)
    expect(line!.amount_minor).toBe(800)
    expect(await evidence((bought as { orderId: string }).orderId)).toEqual([null])
  })

  it('is booked on an application not yet decided, and the order says so for staff', async () => {
    const h = await house(20)
    const wheelchair = await managed('box-office.wheelchair')
    const holder = await wheelchairUser()
    const bought = await buy(h, wheelchair.id, 1, holder)
    expect(bought.ok, JSON.stringify(bought)).toBe(true)
    const orderId = (bought as { orderId: string }).orderId
    expect(await evidence(orderId)).toEqual(['pending'])
    await env.DB.prepare("UPDATE box_office_orders SET state = 'reserved', account_id = ? WHERE id = ?").bind(holder.accountId, orderId).run()
    const order = await req('GET', `/api/box-office/orders/${orderId}`, undefined, person(['box-office.order.view']))
    expect(order.status, JSON.stringify(order.body)).toBe(200)
    expect(order.body.lines[0]).toMatchObject({ ticketType: 'Wheelchair space', requirementPending: true })
  })

  it('costs a member who uses a wheelchair the member price, when that is lower', async () => {
    const h = await house(20)
    const wheelchair = await managed('box-office.wheelchair')
    const memberType = await managed('membership.member')
    expect((await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: memberType.id, amountMinor: 500 }] })).status).toBe(200)
    const bought = await buy(h, wheelchair.id, 1, await wheelchairUser(await member(), true))
    expect(bought.ok, JSON.stringify(bought)).toBe(true)
    const [line] = await rows<{ amount_minor: number, ticket_type_id: string }>('SELECT amount_minor, ticket_type_id FROM box_office_order_lines WHERE order_id = ?', (bought as { orderId: string }).orderId)
    expect(line).toEqual({ amount_minor: 500, ticket_type_id: wheelchair.id })
  })

  it('is refused to someone not on the access scheme, and not sold at all while the scheme is off', async () => {
    const h = await house(20)
    const wheelchair = await managed('box-office.wheelchair')
    expect(await buy(h, wheelchair.id, 1, person([]))).toMatchObject({ ok: false, code: 'box-office.requirement.not-met' })
    const holder = await wheelchairUser(undefined, true)
    await env.DB.prepare("INSERT INTO core_settings (key, value, updated_at) VALUES ('core.access-scheme.enabled', 'false', 0) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run()
    try {
      expect(await buy(h, wheelchair.id, 1, holder)).toMatchObject({ ok: false, code: 'box-office.price.none' })
    }
    finally {
      await env.DB.prepare("DELETE FROM core_settings WHERE key = 'core.access-scheme.enabled'").run()
    }
  })
})

describe('where a type is sold', () => {
  it('keeps a box office only type off the booking page and online baskets, and an online only type off the desk', async () => {
    const h = await house(20)
    const door = await api('POST', '/api/box-office/ticket-types', { name: 'On the door', channel: 'desk' })
    expect(door.status, JSON.stringify(door.body)).toBe(200)
    const web = await api('POST', '/api/box-office/ticket-types', { name: 'Online saver', channel: 'online' })
    expect((await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [
      { bandId: h.bandId, ticketTypeId: door.body.ticketTypeId, amountMinor: 1500 },
      { bandId: h.bandId, ticketTypeId: web.body.ticketTypeId, amountMinor: 900 },
    ] })).status).toBe(200)
    expect((await list()).find(t => t.id === door.body.ticketTypeId)).toMatchObject({ channel: 'desk' })

    expect(await buy(h, door.body.ticketTypeId, 1)).toMatchObject({ ok: false, code: 'box-office.ticket-type.wrong-channel' })
    expect((await buy(h, web.body.ticketTypeId, 1)).ok).toBe(true)
    await publish(h)
    const page = await api('GET', `/api/box-office/book/performances/${h.performanceId}`, undefined, person([]))
    const offered = page.body.bands[0].types.map((t: { ticketTypeId: string }) => t.ticketTypeId)
    expect(offered).toContain(web.body.ticketTypeId)
    expect(offered).not.toContain(door.body.ticketTypeId)

    // At the desk the other way round: the door price is sold, the online saver is refused.
    const desk = (ticketTypeId: string) => inContext(() => pricedLines(h.performanceId, [{ bandId: h.bandId, ticketTypeId, quantity: 1 }], NOV_16, { channel: 'desk', account: null }))
    expect((await desk(door.body.ticketTypeId)).lines[0]).toMatchObject({ amountMinor: 1500 })
    await expect(desk(web.body.ticketTypeId)).rejects.toMatchObject({ code: 'box-office.ticket-type.wrong-channel' })

    // Changing where a module's type is sold is a selling choice, so it is allowed.
    const member = await managed('membership.member')
    expect((await api('PATCH', `/api/box-office/ticket-types/${member.id}`, { channel: 'desk' })).status).toBe(200)
    expect((await api('PATCH', `/api/box-office/ticket-types/${member.id}`, { channel: 'all' })).status).toBe(200)
  })
})
