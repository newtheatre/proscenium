// Baskets (Box office specification, part 3, "An order": nothing to basket). Pressing Hold tickets
// writes the order, its hold, a claim for every ticket and a line for each, in one batch, or
// nothing. The hold starts then and editing never moves its end. A basket has no account yet: it is
// opened again with the token handed back here, which is stored only as its hash and stays the
// browser's own through checkout.
import { all, first, newId, nowMs, refuse, requirements, useContext, useSetting, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { getPerformance } from '#modules/core'
import { orderLines } from './db/schema'
import { claimSeats } from './capacity'
import { hashOf, newReference, randomToken } from './codes'
import { pricesFor, type Price } from './prices'
import { poolsOf, salesOf } from './setup'
import { entitle, type Buyer, type Requirement } from './entitlement'
import { applyCode, judgeCode, redeem } from './promo-codes'
import { sellableTypes, soldOn } from './ticket-types'
import { judgePasses, letGoBaskets, passEntryTypeId, redeemPasses, type JudgedPass, type PassAsk } from './pass-entries'
import { WHEELCHAIR_TYPE } from './prices'

/**
 * `references`, one for each ticket in turn, are typed in place of signing in, such as student IDs
 * for a member price. `holders`, at the desk: the account named for each ticket in turn, found by
 * their card or by name, for a type with requirements.
 */
export interface BasketLineInput { bandId: string, ticketTypeId: string, quantity: number, references?: string[], holders?: string[] }
/** `promoCode`, as the buyer typed it (BO-17). `passes`: each gives one entry at no charge (BO-64). */
export interface BasketInput { performanceId: string, lines: BasketLineInput[], promoCode?: string, passes?: PassAsk[] }

export interface Basket {
  orderId: string
  reference: string
  /** Opens the basket again. Shown once and never stored. */
  token: string
  expiresAt: number
  currency: string
  totalMinor: number
  lines: { id: string, bandId: string, ticketTypeId: string, amountMinor: number }[]
}

const NOT_ON_SALE: Record<string, { code: string, reason: string }> = {
  draft: { code: 'box-office.sales.not-yet', reason: 'This performance is not on sale yet.' },
  paused: { code: 'box-office.sales.paused', reason: 'Sales are paused for this performance.' },
  closed: { code: 'box-office.sales.closed', reason: 'Sales have closed for this performance.' },
}

/** When online sales close: the time set on the sales record, or the setting's time before curtain. */
export async function offSaleAt(sales: { offSaleAt: number | null }, startsAt: number): Promise<number> {
  return sales.offSaleAt ?? startsAt - (await useSetting('box-office.sales.close-before') as number) * 1000 // not-policy: seconds to milliseconds
}

export interface PricedLine { bandId: string, ticketTypeId: string, priceId: string, amountMinor: number, requirement: Requirement | null }

/**
 * Each ticket asked for, one line apiece, at the price in force at `at`, with the pools they come
 * from. Complimentary tickets are never sold: they come only from an approved request. A type with
 * requirements is checked for `buyer` (see entitlement.ts); `guard` adds its limits to the unit.
 */
export async function pricedLines(performanceId: string, asked: BasketLineInput[], at: number, buyer: Buyer, beside = 0): Promise<{ pool: Map<string, { id: string }>, lines: PricedLine[], currency: string, guard: (unit: UnitView) => void }> {
  const [pools, prices, types] = await Promise.all([poolsOf(performanceId), pricesFor(performanceId, at), sellableTypes()])
  const pool = new Map(pools.map(p => [p.bandId, p]))
  const price = new Map(prices.map(p => [`${p.bandId} ${p.ticketTypeId}`, p]))
  for (const line of asked) {
    const type = types.get(line.ticketTypeId)
    if (!pool.has(line.bandId) || !type || type.kind === 'complimentary' || !price.has(`${line.bandId} ${line.ticketTypeId}`))
      refuse('box-office.price.none', 'One of these tickets is not on sale for this performance.', { status: 422, remedy: 'Reload to see what is on sale.' })
    // A desk-only type is never sold online, nor an online-only one at the desk.
    if (!soldOn(type.channel, buyer.channel))
      refuse('box-office.ticket-type.wrong-channel', buyer.channel === 'online' ? 'One of these tickets is sold only at the box office.' : 'One of these tickets is sold only online.', { status: 422, remedy: 'Reload to see what is on sale.' })
  }
  // A pass entry beside it (`beside`) is a ticket a companion may accompany, as a paid one is.
  if (!beside && asked.some(l => types.get(l.ticketTypeId)!.needsPaidTicket) && !asked.some(l => !types.get(l.ticketTypeId)!.needsPaidTicket))
    refuse('box-office.order.companion-alone', 'A companion ticket is booked together with the ticket it accompanies.', { status: 422 })
  const lowered = await lowestFor(performanceId, asked, prices, types, buyer)
  const each = asked.flatMap(l => Array.from({ length: l.quantity }, (_, n) => {
    const p = lowered.get(`${l.bandId} ${l.ticketTypeId}`) ?? price.get(`${l.bandId} ${l.ticketTypeId}`)!
    const reference = l.references?.[n]?.trim() || undefined
    const holder = buyer.channel === 'desk' ? l.holders?.[n] || undefined : undefined
    return { bandId: l.bandId, ticketTypeId: l.ticketTypeId, priceId: p.id, amountMinor: p.amountMinor, ...(reference ? { reference } : {}), ...(holder ? { holder } : {}) }
  }))
  const entitled = await entitle(performanceId, each, types, buyer)
  const lines = each.map(({ reference: _typed, holder: _named, ...l }, i) => ({ ...l, requirement: entitled.requirements[i] ?? null }))
  return { pool, lines, currency: prices[0]?.currency ?? await useSetting('core.locale.currency') as string, guard: entitled.guard }
}

export interface PassLines {
  /** Entries that use a wheelchair space: asked for as Wheelchair space tickets, whose price the pass then covers. */
  asks: BasketLineInput[]
  /** For each pass in turn: the band its entry is in, and whether it is one of `asks`. */
  entries: { pass: JudgedPass, bandId: string, wheelchair: boolean }[]
}

/**
 * Where each pass's entry goes. An ordinary entry takes the part of the house asked for, or the
 * first seating section with room. An entry in a wheelchair space is sold as a Wheelchair space
 * ticket is, with the same check that the holder may have one and the same room taken.
 */
export async function passLines(performanceId: string, asks: readonly PassAsk[], judged: readonly JudgedPass[], at: number): Promise<PassLines> {
  if (!asks.length) return { asks: [], entries: [] }
  const pools = await poolsOf(performanceId)
  const seating = pools.filter(p => p.bandKind !== 'wheelchair')
  const prices = asks.some(a => a.wheelchair) ? await pricesFor(performanceId, at) : []
  const wheelchairType = asks.some(a => a.wheelchair) ? [...(await sellableTypes()).values()].find(t => t.managedBy === WHEELCHAIR_TYPE) : undefined
  const out: PassLines = { asks: [], entries: [] }
  asks.forEach((ask, i) => {
    if (ask.wheelchair) {
      const spaces = prices.filter(p => p.ticketTypeId === wheelchairType?.id)
      const price = spaces.find(p => p.bandId === ask.bandId) ?? spaces.find(p => pools.find(o => o.bandId === p.bandId)?.bandKind === 'wheelchair') ?? spaces[0]
      if (!price) refuse('box-office.pass.no-wheelchair', 'There are no wheelchair spaces to book for this performance.', { status: 422, remedy: 'Ask the box office.', fields: { pass: 'no-wheelchair' } })
      out.asks.push({ bandId: price.bandId, ticketTypeId: price.ticketTypeId, quantity: 1 })
      out.entries.push({ pass: judged[i]!, bandId: price.bandId, wheelchair: true })
      return
    }
    const pool = ask.bandId ? seating.find(p => p.bandId === ask.bandId) : seating.find(p => p.capacity - p.claimed > 0) ?? seating[0]
    if (!pool) refuse('box-office.price.none', 'One of these tickets is not on sale for this performance.', { status: 422, remedy: 'Reload to see what is on sale.' })
    out.entries.push({ pass: judged[i]!, bandId: pool.bandId, wheelchair: false })
  })
  return out
}

/**
 * A Wheelchair space costs the lowest price the buyer can have in its band, or anywhere in the house
 * where a seating layout counts the spaces: its own price is the lowest open to everyone, and a signed-in buyer who qualifies for a cheaper type, such as Member,
 * pays that instead. Only the cheaper types are asked about, cheapest first.
 */
async function lowestFor(performanceId: string, asked: BasketLineInput[], prices: Price[], types: Awaited<ReturnType<typeof sellableTypes>>, buyer: { channel: 'online' | 'desk', account: string | null }): Promise<Map<string, Price>> {
  const out = new Map<string, Price>()
  if (buyer.channel !== 'online' || !buyer.account) return out
  for (const line of asked) {
    const own = prices.find(p => p.bandId === line.bandId && p.ticketTypeId === line.ticketTypeId)
    if (!own?.derived) continue
    const cheaper = prices.filter((p) => {
      const type = types.get(p.ticketTypeId)
      return (own.house || p.bandId === line.bandId) && !p.derived && p.amountMinor < own.amountMinor && type && type.requirementRefs.length
        && type.kind !== 'companion' && type.kind !== 'complimentary' && !type.needsPaidTicket && soldOn(type.channel, 'online')
    }).sort((a, b) => a.amountMinor - b.amountMinor)
    for (const p of cheaper) {
      const answers = await requirements.check({ accounts: [buyer.account], refs: types.get(p.ticketTypeId)!.requirementRefs, record: ['core.performance', performanceId], whenUnavailable: 'not-met' })
      if (answers.some(a => a.verdict === 'met' && !a.unavailable)) {
        out.set(`${line.bandId} ${line.ticketTypeId}`, p)
        break
      }
    }
  }
  return out
}

/** Adds an online basket to the unit: every ticket asked for is held together, or nothing is. */
export async function createBasket(unit: UnitView, input: BasketInput): Promise<Basket> {
  const sales = await salesOf(input.performanceId)
  if (!sales) refuse('box-office.sales.none', 'This performance is not sold here.', { status: 404 })
  const performance = await getPerformance(input.performanceId)
  const at = nowMs()
  const closes = await offSaleAt(sales, performance.startsAt)
  if (performance.state !== 'scheduled' || at >= closes) refuse(NOT_ON_SALE.closed!.code, NOT_ON_SALE.closed!.reason)
  if (sales.state !== 'on_sale') refuse(NOT_ON_SALE[sales.state]!.code, NOT_ON_SALE[sales.state]!.reason)

  const asks = input.passes ?? []
  const quantity = input.lines.reduce((sum, l) => sum + l.quantity, 0) + asks.length
  const cap = sales.maxPerOrder ?? await useSetting('box-office.orders.seat-cap') as number
  if (quantity > cap) refuse('box-office.order.too-many', `At most ${cap} tickets in one order.`, { status: 422, remedy: 'For a larger group, ask the box office.' })

  const account = useContext().actor.accountId ?? null
  // Each pass gives one entry. Those in a wheelchair space are priced and checked as Wheelchair space
  // tickets, after the tickets asked for; the others are lines of their own at no charge, last.
  const passes = await passLines(input.performanceId, asks, await judgePasses(asks, input.performanceId, { channel: 'online', account }, at), at)
  const priced = await pricedLines(input.performanceId, [...input.lines, ...passes.asks], at, { channel: 'online', account }, asks.length)
  const { pool, currency, guard } = priced
  const bought = priced.lines.length - passes.asks.length
  const typedCode = input.promoCode?.trim()
  const discounted = [...(typedCode ? await applyCode(await judgeCode(typedCode, input.performanceId, at), input.performanceId, priced.lines.slice(0, bought)) : priced.lines.slice(0, bought).map(() => null)), ...asks.map(() => null)]
  const ordinary = passes.entries.filter(e => !e.wheelchair)
  const entryTypeId = ordinary.length ? await passEntryTypeId() : ''
  const lines: (Omit<PricedLine, 'priceId'> & { priceId: string | null })[] = [...priced.lines, ...ordinary.map(e => ({ bandId: e.bandId, ticketTypeId: entryTypeId, priceId: null, amountMinor: 0, requirement: null }))]
  // The pass each line is an entry of, in the lines' order: wheelchair entries first, as they were asked.
  const entryOf: (JudgedPass | null)[] = [...priced.lines.slice(0, bought).map(() => null), ...passes.entries.filter(e => e.wheelchair).map(e => e.pass), ...ordinary.map(e => e.pass)]
  const charged = lines.map((l, i) => entryOf[i] ? 0 : l.amountMinor - (discounted[i]?.discountMinor ?? 0))

  unit.add({ sql: "UPDATE box_office_performance_sales SET updated_at = updated_at WHERE id = ? AND state = 'on_sale' AND (off_sale_at IS NULL OR off_sale_at > ?)", params: [sales.id, at] })
    .expect(1, NOT_ON_SALE.paused)

  const orderId = newId('ord')
  const holdId = newId('hold')
  const reference = newReference()
  const token = randomToken()
  const holdFor = sales.holdMinutes !== null ? sales.holdMinutes * 60 : await useSetting('box-office.baskets.hold-for') as number // not-policy: minutes to seconds
  const expiresAt = at + holdFor * 1000 // not-policy: seconds to milliseconds
  const totalMinor = charged.reduce((sum, amount) => sum + amount, 0)

  unit.add({
    sql: "INSERT INTO box_office_orders (id, reference, channel, state, signed_in, currency, total_minor, basket_token_hash, expires_at, keep, created_at, updated_at) VALUES (?, ?, 'online', 'basket', 0, ?, ?, ?, ?, 0, ?, ?)",
    params: [orderId, reference, currency, totalMinor, await hashOf(token), expiresAt, at, at],
  })
  unit.add({ sql: "INSERT INTO box_office_holds (id, kind, order_id, created_at, updated_at) VALUES (?, 'basket', ?, ?, ?)", params: [holdId, orderId, at, at] })
  // The buyer's own basket in another browser, holding tickets of a type with a limit for each
  // holder, would count against this one until it lapses: starting again here lets it go (B18).
  if (account) await letGoOtherBaskets(unit, account, input.performanceId, lines.filter(l => l.requirement?.accountId === account).map(l => l.ticketTypeId), at)
  // So would a basket left holding an entry of one of these passes.
  await letGoBaskets(unit, passes.entries.map(e => e.pass), input.performanceId, performance.productionId, at)
  const requests = [...[...input.lines, ...passes.asks].map(l => ({ poolId: pool.get(l.bandId)!.id, quantity: l.quantity })), ...ordinary.map(e => ({ poolId: pool.get(e.bandId)!.id, quantity: 1 }))]
  const claimed = (await claimSeats(unit, { holdId, requests, expiresAt })).flat()
  guard(unit)
  const redemptions = redeem(unit, orderId, discounted.slice(0, bought), claimed)
  const entries = redeemPasses(unit, orderId, input.performanceId, performance.productionId, entryOf.flatMap((pass, i) => pass ? [{ pass, claimId: claimed[i]! }] : []))
  let entry = 0
  const lineIds = unit.insertSet(orderLines, lines.map((l, i) => ({
    orderId, kind: 'ticket', performanceId: input.performanceId, bandId: l.bandId, ticketTypeId: l.ticketTypeId, claimId: claimed[i], priceId: l.priceId, listMinor: l.amountMinor,
    // A pass covers the whole of its ticket's price, which is nothing except for a wheelchair space's.
    discountMinor: entryOf[i] ? l.amountMinor : discounted[i]?.discountMinor ?? 0, amountMinor: charged[i]!, state: 'live',
    requirementRef: l.requirement?.ref ?? null, requirementAccountId: l.requirement?.accountId ?? null, requirementEvidenceId: l.requirement?.evidence ?? null, promoRedemptionId: redemptions[i] ?? null, passRedemptionId: entryOf[i] ? entries[entry++]! : null,
  })))
  unit.expect(lines.length)
  return { orderId, reference, token, expiresAt, currency, totalMinor, lines: lines.map((l, i) => ({ id: lineIds[i]!, bandId: l.bandId, ticketTypeId: l.ticketTypeId, amountMinor: charged[i]! })) }
}

export interface BasketView {
  orderId: string
  reference: string
  state: string
  expiresAt: number | null
  currency: string
  totalMinor: number
  /** `listMinor` is the price before any promo code; `amountMinor` what is charged. */
  lines: { id: string, performanceId: string, bandId: string, ticketTypeId: string, amountMinor: number, listMinor: number, /** The pass this ticket is an entry of, by its name (the passes ruling). */ pass?: string }[]
  /** The promo code the basket was held with and what it takes off, or null (BO-17). */
  promo: { code: string, savingMinor: number } | null
}

/** A basket, for whoever holds its token. A lapsed basket holds nothing and says so. */
export async function basketByToken(orderId: string, token: string): Promise<BasketView | null> {
  const order = await first<{ id: string, reference: string, state: string, expires_at: number | null, currency: string, total_minor: number }>(
    'SELECT id, reference, state, expires_at, currency, total_minor FROM box_office_orders WHERE id = ? AND basket_token_hash = ?', orderId, await hashOf(token))
  if (!order) return null
  const lapsed = order.state === 'basket' && order.expires_at !== null && order.expires_at <= nowMs()
  const lines = lapsed
    ? []
    : await all<{ id: string, performance_id: string, band_id: string, ticket_type_id: string, amount_minor: number, list_minor: number, discount_minor: number, code: string | null, pass: string | null }>(
        `SELECT l.id, l.performance_id, l.band_id, l.ticket_type_id, l.amount_minor, l.list_minor, CASE WHEN l.pass_redemption_id IS NULL THEN l.discount_minor ELSE 0 END AS discount_minor, c.code, y.name AS pass FROM box_office_order_lines l
          LEFT JOIN box_office_promo_redemptions r ON r.id = l.promo_redemption_id LEFT JOIN box_office_promo_codes c ON c.id = r.promo_code_id
          LEFT JOIN box_office_pass_redemptions d ON d.id = l.pass_redemption_id LEFT JOIN box_office_passes p ON p.id = d.pass_id LEFT JOIN box_office_pass_types y ON y.id = p.pass_type_id
          WHERE l.order_id = ? AND l.kind = 'ticket' AND l.state = 'live' ORDER BY l.id`, orderId)
  const saving = lines.reduce((sum, l) => sum + l.discount_minor, 0)
  const code = lines.find(l => l.code)?.code
  return {
    orderId: order.id,
    reference: order.reference,
    state: lapsed ? 'expired' : order.state,
    expiresAt: order.expires_at,
    currency: order.currency,
    totalMinor: lapsed ? 0 : order.total_minor,
    lines: lines.map(l => ({ id: l.id, performanceId: l.performance_id, bandId: l.band_id, ticketTypeId: l.ticket_type_id, amountMinor: l.amount_minor, listMinor: l.list_minor, ...(l.pass ? { pass: l.pass } : {}) })),
    promo: code && saving > 0 ? { code, savingMinor: saving } : null,
  }
}

/**
 * Lets go the buyer's other live baskets that hold tickets of these types for this performance under
 * their own account, so a holder's limit is not used up by a basket they left in another browser. The
 * seats go back on sale and that basket says it has run out, as one that lapsed does.
 */
async function letGoOtherBaskets(unit: UnitView, account: string, performanceId: string, typeIds: string[], at: number): Promise<void> {
  if (!typeIds.length) return
  const others = await all<{ id: string }>(
    `SELECT DISTINCT o.id FROM box_office_orders o JOIN box_office_order_lines l ON l.order_id = o.id
      WHERE o.state = 'basket' AND o.expires_at > ?1 AND l.performance_id = ?2 AND l.state = 'live'
        AND l.ticket_type_id IN (SELECT value FROM json_each(?3)) AND l.requirement_account_id IN (${accountScopeSql('?4')})`, // not-policy: ?3 and ?4 are SQL parameter numbers
    at, performanceId, JSON.stringify([...new Set(typeIds)]), account)
  for (const other of others) {
    unit.add({ sql: "UPDATE box_office_orders SET state = 'expired', updated_at = ? WHERE id = ? AND state = 'basket'", params: [at, other.id] })
    unit.add({ sql: "UPDATE box_office_claims SET state = 'released', released_at = ?, release_reason = 'abandoned' WHERE state = 'held' AND hold_id IN (SELECT id FROM box_office_holds WHERE order_id = ? AND kind = 'basket')", params: [at, other.id] })
    unit.announce('box-office.order.expired', { orderId: other.id }, { record: ['box-office.order', other.id] })
  }
}
