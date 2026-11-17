// Promotional codes (Box office specification, BO-17): typed when booking, a code takes a percentage
// or an amount off eligible tickets, or sets their price, and the saving is shown. A code may be
// limited to a production, a performance, a ticket type or a part of the house, to a number of uses
// and to a number of tickets in one order, and to a window of dates. Each ticket it is used on is a
// redemption tied to the ticket's seat: the triggers keep the code's count, its CHECK is the limit,
// so the last use is given once however many baskets ask at the same moment, and a seat given back
// gives back its use. An expired, used-up or inapplicable code says which.
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { all, first, idSchema, newId, nowMs, refuse, type UnitView } from '#kit'
import { getPerformance } from '#modules/core'

export type Effect = 'percent_off' | 'amount_off' | 'set_price'

export interface PromoCode {
  id: string
  code: string
  effect: Effect
  /** Basis points for percent_off, minor units otherwise. */
  value: number
  productionId: string | null
  performanceId: string | null
  ticketTypeId: string | null
  bandId: string | null
  maxUses: number | null
  used: number
  maxPerOrder: number | null
  validFrom: number | null
  validUntil: number | null
  active: boolean
  note: string | null
}

interface Row { id: string, code: string, effect: Effect, value: number, production_id: string | null, performance_id: string | null, ticket_type_id: string | null, band_id: string | null, max_uses: number | null, used: number, max_per_order: number | null, valid_from: number | null, valid_until: number | null, active: number, note: string | null }

const toCode = (r: Row): PromoCode => ({
  id: r.id, code: r.code, effect: r.effect, value: r.value, productionId: r.production_id, performanceId: r.performance_id, ticketTypeId: r.ticket_type_id, bandId: r.band_id,
  maxUses: r.max_uses, used: r.used, maxPerOrder: r.max_per_order, validFrom: r.valid_from, validUntil: r.valid_until, active: !!r.active, note: r.note,
})

/** A code as typed: spaces dropped and upper-case, so "spring 25" and "SPRING25" are the same code. */
export const normaliseCode = (typed: string) => typed.replace(/\s+/g, '').toUpperCase()

export const promoInput = z.object({
  code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9 _-]+$/, 'Letters, numbers, hyphens and underscores only.'), // not-policy: a code someone can type
  effect: z.enum(['percent_off', 'amount_off', 'set_price']),
  value: z.number().int().min(0).max(10_000_000), // not-policy: a sanity bound; percent_off is held to 10000 basis points
  productionId: z.string().min(3).max(40).nullable().optional(), // not-policy: an id
  performanceId: idSchema('perf').nullable().optional(),
  ticketTypeId: idSchema('tty').nullable().optional(),
  maxUses: z.number().int().min(1).max(1_000_000).nullable().optional(), // not-policy: a sanity bound
  maxPerOrder: z.number().int().min(1).max(500).nullable().optional(), // not-policy: the desk cap's own ceiling
  validFrom: z.number().int().positive().nullable().optional(),
  validUntil: z.number().int().positive().nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(), // not-policy: one line about who it is for
}).strict()
export type PromoInput = z.infer<typeof promoInput>

export async function listPromoCodes(): Promise<PromoCode[]> {
  return (await all<Row>('SELECT * FROM box_office_promo_codes ORDER BY active DESC, code')).map(toCode)
}

async function checked(input: PromoInput): Promise<PromoInput & { code: string }> {
  if (input.effect === 'percent_off' && (input.value < 1 || input.value > 10000)) // not-policy: basis points, 1 to 100 per cent
    refuse('box-office.promo.percent', 'A percentage off is between 1 and 100.', { status: 422, fields: { value: 'Between 1 and 100.' } })
  if (input.effect === 'amount_off' && input.value < 1) refuse('box-office.promo.amount', 'An amount off is more than nothing.', { status: 422, fields: { value: 'More than nothing.' } })
  if (input.validFrom && input.validUntil && input.validUntil <= input.validFrom)
    refuse('box-office.promo.window', 'The code ends before it starts.', { status: 422, fields: { validUntil: 'After the start.' } })
  if (input.performanceId) {
    const performance = await getPerformance(input.performanceId)
    if (input.productionId && performance.productionId !== input.productionId) refuse('box-office.promo.scope', 'That performance is not of that production.', { status: 422, fields: { performanceId: 'Not of this production.' } })
  }
  if (input.ticketTypeId && !await first("SELECT 1 FROM box_office_ticket_types WHERE id = ? AND kind <> 'complimentary'", input.ticketTypeId))
    refuse('box-office.ticket-type.not-found', 'There is no such ticket type, or it is not sold.', { status: 422, fields: { ticketTypeId: 'Choose another.' } })
  return { ...input, code: normaliseCode(input.code) }
}

const TAKEN = { code: 'box-office.promo.taken', reason: 'Another promo code is already called that.', fields: { code: 'Choose another code.' } }

export async function createPromoCode(unit: UnitView, input: PromoInput, actorId: string | null): Promise<string> {
  const c = await checked(input)
  if (await first('SELECT 1 FROM box_office_promo_codes WHERE code = ?', c.code)) refuse(TAKEN.code, TAKEN.reason, { status: 409, fields: TAKEN.fields })
  const id = newId('prm')
  const at = nowMs()
  unit.add(sql`INSERT INTO box_office_promo_codes (id, code, effect, value, production_id, performance_id, ticket_type_id, max_uses, max_per_order, valid_from, valid_until, active, note, created_by, created_at, updated_at)
    SELECT ${id}, ${c.code}, ${c.effect}, ${c.value}, ${c.productionId ?? null}, ${c.performanceId ?? null}, ${c.ticketTypeId ?? null}, ${c.maxUses ?? null}, ${c.maxPerOrder ?? null}, ${c.validFrom ?? null}, ${c.validUntil ?? null}, 1, ${c.note ?? null}, ${actorId}, ${at}, ${at}
    WHERE NOT EXISTS (SELECT 1 FROM box_office_promo_codes WHERE code = ${c.code})`).expect(1, TAKEN)
  unit.audit({ action: 'create', record: ['box-office.promo-code', id] })
  return id
}

/** Changes a code. Its uses so far stay; a limit below them is refused by the table's CHECK, said plainly first. */
export async function updatePromoCode(unit: UnitView, id: string, input: PromoInput): Promise<void> {
  const c = await checked(input)
  const now = await first<{ used: number }>('SELECT used FROM box_office_promo_codes WHERE id = ?', id)
  if (!now) refuse('box-office.promo.not-found', 'There is no such promo code.', { status: 404 })
  if (c.maxUses !== null && c.maxUses !== undefined && c.maxUses < now.used)
    refuse('box-office.promo.below-used', `This code has been used ${now.used} times, so its limit cannot go below that.`, { status: 422, fields: { maxUses: `At least ${now.used}.` } })
  unit.add(sql`UPDATE box_office_promo_codes SET code = ${c.code}, effect = ${c.effect}, value = ${c.value}, production_id = ${c.productionId ?? null}, performance_id = ${c.performanceId ?? null},
    ticket_type_id = ${c.ticketTypeId ?? null}, max_uses = ${c.maxUses ?? null}, max_per_order = ${c.maxPerOrder ?? null}, valid_from = ${c.validFrom ?? null}, valid_until = ${c.validUntil ?? null},
    note = ${c.note ?? null}, updated_at = ${nowMs()}
    WHERE id = ${id} AND NOT EXISTS (SELECT 1 FROM box_office_promo_codes WHERE code = ${c.code} AND id <> ${id})
      AND (${c.maxUses ?? null} IS NULL OR used <= ${c.maxUses ?? null})`).expect(1, TAKEN)
  unit.audit({ action: 'update', record: ['box-office.promo-code', id] })
}

/** Retires a code, or brings it back. Tickets already sold with it keep their price. */
export function setPromoActive(unit: UnitView, id: string, active: boolean): void {
  unit.add(sql`UPDATE box_office_promo_codes SET active = ${active ? 1 : 0}, updated_at = ${nowMs()} WHERE id = ${id}`)
    .expect(1, { code: 'box-office.promo.not-found', reason: 'There is no such promo code.' })
  unit.audit({ action: 'state', record: ['box-office.promo-code', id], detail: { active } })
}

/** What a code takes off one ticket at a list price: never more than the price. */
export function discountOf(code: Pick<PromoCode, 'effect' | 'value'>, listMinor: number): number {
  if (code.effect === 'percent_off') return Math.min(listMinor, Math.round(listMinor * code.value / 10000)) // not-policy: basis points
  if (code.effect === 'amount_off') return Math.min(listMinor, code.value)
  return Math.max(0, listMinor - code.value)
}

/** Whether a code applies to one ticket: its production, performance, type and part of the house. */
export function appliesTo(code: PromoCode, line: { productionId: string, performanceId: string, ticketTypeId: string, bandId: string }): boolean {
  return (!code.productionId || code.productionId === line.productionId)
    && (!code.performanceId || code.performanceId === line.performanceId)
    && (!code.ticketTypeId || code.ticketTypeId === line.ticketTypeId)
    && (!code.bandId || code.bandId === line.bandId)
}

/**
 * The code a buyer typed, judged for a performance at a moment: the code, or a refusal that says
 * which of unknown, not yet, expired, used up or not for this performance it is.
 */
export async function judgeCode(typed: string, performanceId: string, at = nowMs()): Promise<PromoCode> {
  const row = await first<Row>('SELECT * FROM box_office_promo_codes WHERE code = ?', normaliseCode(typed))
  const fields = { promoCode: 'invalid' }
  if (!row) refuse('box-office.promo.unknown', 'We do not recognise that code.', { status: 422, remedy: 'Check how it is spelt.', fields })
  const code = toCode(row)
  if (!code.active || (code.validUntil !== null && at >= code.validUntil)) refuse('box-office.promo.expired', 'That code has expired.', { status: 422, fields })
  if (code.validFrom !== null && at < code.validFrom) refuse('box-office.promo.not-yet', 'That code cannot be used yet.', { status: 422, fields })
  if (code.maxUses !== null && code.used >= code.maxUses) refuse('box-office.promo.used-up', 'That code has been used up.', { status: 409, fields })
  const performance = await getPerformance(performanceId)
  if ((code.productionId && code.productionId !== performance.productionId) || (code.performanceId && code.performanceId !== performanceId))
    refuse('box-office.promo.not-here', 'That code is not for this performance.', { status: 422, fields })
  return code
}

export interface Discounted { promoCodeId: string, discountMinor: number }

/**
 * Which of an order's tickets the code takes money off, most expensive first, up to its limit for
 * one order and its uses left. A code that applies to none of them is refused, saying so.
 */
export async function applyCode(code: PromoCode, performanceId: string, lines: readonly { bandId: string, ticketTypeId: string, amountMinor: number }[]): Promise<(Discounted | null)[]> {
  const performance = await getPerformance(performanceId)
  const out: (Discounted | null)[] = lines.map(() => null)
  const order = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.amountMinor > 0 && appliesTo(code, { productionId: performance.productionId, performanceId, ticketTypeId: l.ticketTypeId, bandId: l.bandId }))
    .sort((a, b) => b.l.amountMinor - a.l.amountMinor)
  const left = code.maxUses === null ? Infinity : code.maxUses - code.used
  const most = Math.min(code.maxPerOrder ?? Infinity, left)
  for (const { l, i } of order.slice(0, most)) {
    const discountMinor = discountOf(code, l.amountMinor)
    if (discountMinor > 0) out[i] = { promoCodeId: code.id, discountMinor }
  }
  if (!out.some(Boolean)) refuse('box-office.promo.no-tickets', 'That code does not apply to any of these tickets.', { status: 422, remedy: 'Choose the tickets it is for, or remove the code.', fields: { promoCode: 'invalid' } })
  return out
}

const USED_UP = { code: 'box-office.promo.used-up', reason: 'That code has just been used up.', remedy: 'Book without it, or try another code.' }

/**
 * Writes the redemptions for the discounted tickets, one per seat, after their claims. The guard
 * comes first on the statement, so the last use is given once; the triggers count it.
 */
export function redeem(unit: UnitView, orderId: string, discounted: readonly (Discounted | null)[], claimIds: readonly (string | undefined)[]): (string | null)[] {
  const used = discounted.filter(Boolean) as Discounted[]
  if (!used.length) return discounted.map(() => null)
  const codeId = used[0]!.promoCodeId
  const at = nowMs()
  unit.add(sql`UPDATE box_office_promo_codes SET updated_at = updated_at WHERE id = ${codeId} AND active = 1
    AND (valid_until IS NULL OR valid_until > ${at}) AND (max_uses IS NULL OR used + ${used.length} <= max_uses)`).expect(1, USED_UP)
  return discounted.map((d, i) => {
    if (!d) return null
    const id = newId('prr')
    unit.add(sql`INSERT INTO box_office_promo_redemptions (id, promo_code_id, order_id, claim_id, state, created_at, updated_at) VALUES (${id}, ${d.promoCodeId}, ${orderId}, ${claimIds[i]!}, 'live', ${at}, ${at})`)
    return id
  })
}
