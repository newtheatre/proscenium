// Passes as products (BO-64; mock-up approved by Matt 2026-11-18). A pass gives one entry at each
// performance it covers, as a ticket is one entry, and is paid for once. It is not a ticket type
// and has no tie to one: it covers named productions, a season or everything between two dates,
// and has its own prices, each with a name, an amount and, when wanted, who may buy it (requirement
// references checked through the kit, as a ticket type's are). This file is the set-up: making,
// changing and retiring a pass. Selling one and using its entries are in pass-sales.ts and
// pass-entries.ts as they are built.
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { all, first, idSchema, newId, nowMs, refuse, requirements, type UnitView } from '#kit'
import { CHANNELS, type Channel } from './ticket-types'

export const COVERS = ['productions', 'season', 'dates'] as const
export type Covers = (typeof COVERS)[number]
export const PER_SHOW = ['once', 'any'] as const
export const HOLDERS = ['auto', 'named', 'open'] as const

export interface PassPrice {
  id: string
  name: string
  amountMinor: number
  requirementRefs: string[]
  proofNote: string | null
  /** Ticket types this price is offered instead of, as a swap, when someone books them. */
  insteadOf: string[]
  active: boolean
  /** Passes sold at this price, so it can be retired but not removed. */
  sold: number
}

export interface PassType {
  id: string
  name: string
  description: string | null
  covers: Covers
  seasonId: string | null
  coversFrom: number | null
  coversUntil: number | null
  productionIds: string[]
  perShow: 'once' | 'any'
  uses: number | null
  holder: 'auto' | 'named' | 'open'
  reserveUnpaid: boolean
  bookAhead: boolean
  recheck: boolean
  channel: Channel
  onSale: boolean
  saleFrom: number | null
  saleUntil: number | null
  active: boolean
  currency: string
  prices: PassPrice[]
  /** Passes people hold, and how many of those are not yet paid for. */
  held: number
  unpaid: number
}

interface TypeRow { id: string, name: string, description: string | null, covers: Covers, season_id: string | null, covers_from: number | null, covers_until: number | null, per_show: 'once' | 'any', uses: number | null, holder: 'auto' | 'named' | 'open', reserve_unpaid: number, book_ahead: number, recheck: number, channel: Channel, on_sale: number, sale_from: number | null, sale_until: number | null, active: number, currency: string, held: number, unpaid: number }
interface PriceRow { id: string, pass_type_id: string, name: string, amount_minor: number, requirement_refs: string | null, proof_note: string | null, instead_of: string | null, active: number, sold: number }

const refsOf = (text: string | null): string[] => {
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string') : []
  }
  catch {
    return []
  }
}
const refsText = (refs: readonly string[] | undefined): string | null => (refs?.length ? JSON.stringify([...refs]) : null)

const toPrice = (r: PriceRow): PassPrice => ({ id: r.id, name: r.name, amountMinor: r.amount_minor, requirementRefs: refsOf(r.requirement_refs), proofNote: r.proof_note, insteadOf: refsOf(r.instead_of), active: !!r.active, sold: r.sold })

const TYPES = `SELECT t.*,
  (SELECT count(*) FROM box_office_passes p WHERE p.pass_type_id = t.id AND p.state = 'active') AS held,
  (SELECT count(*) FROM box_office_passes p WHERE p.pass_type_id = t.id AND p.state = 'active' AND p.paid_at IS NULL) AS unpaid
  FROM box_office_pass_types t`
const PRICES = 'SELECT r.*, (SELECT count(*) FROM box_office_passes p WHERE p.pass_price_id = r.id) AS sold FROM box_office_pass_prices r'

function toType(r: TypeRow, prices: PriceRow[], shows: { pass_type_id: string, production_id: string }[]): PassType {
  return {
    id: r.id, name: r.name, description: r.description, covers: r.covers, seasonId: r.season_id, coversFrom: r.covers_from, coversUntil: r.covers_until,
    productionIds: shows.filter(s => s.pass_type_id === r.id).map(s => s.production_id),
    perShow: r.per_show, uses: r.uses, holder: r.holder, reserveUnpaid: !!r.reserve_unpaid, bookAhead: !!r.book_ahead, recheck: !!r.recheck, channel: r.channel,
    onSale: !!r.on_sale, saleFrom: r.sale_from, saleUntil: r.sale_until, active: !!r.active, currency: r.currency,
    prices: prices.filter(p => p.pass_type_id === r.id).map(toPrice), held: r.held, unpaid: r.unpaid,
  }
}

/** Every pass, those on offer first. */
export async function listPassTypes(): Promise<PassType[]> {
  const [types, prices, shows] = await Promise.all([
    all<TypeRow>(`${TYPES} ORDER BY t.active DESC, t.name COLLATE NOCASE`),
    all<PriceRow>(`${PRICES} ORDER BY r.sort, r.name COLLATE NOCASE`),
    all<{ pass_type_id: string, production_id: string }>('SELECT pass_type_id, production_id FROM box_office_pass_shows'),
  ])
  return types.map(t => toType(t, prices, shows))
}

export async function getPassType(id: string): Promise<PassType> {
  const row = await first<TypeRow>(`${TYPES} WHERE t.id = ?`, id)
  if (!row) refuse('box-office.pass.not-found', 'There is no such pass.', { status: 404 })
  const [prices, shows] = await Promise.all([
    all<PriceRow>(`${PRICES} WHERE r.pass_type_id = ? ORDER BY r.sort, r.name COLLATE NOCASE`, id),
    all<{ pass_type_id: string, production_id: string }>('SELECT pass_type_id, production_id FROM box_office_pass_shows WHERE pass_type_id = ?', id),
  ])
  return toType(row, prices, shows)
}

const priceInput = z.object({
  // Absent for a price being added.
  id: idSchema('ppr').optional(),
  name: z.string().trim().min(1).max(60), // not-policy: a price's name on a button
  amountMinor: z.number().int().min(0).max(100_000_000), // not-policy: a sanity bound
  requirementRefs: z.array(z.string().min(3).max(200)).max(10).optional(), // not-policy: bounds on a list of references
  proofNote: z.string().trim().max(200).nullable().optional(), // not-policy: one line about proof to bring
  insteadOf: z.array(idSchema('tty')).max(20).optional(), // not-policy: bounds on a list of ticket types
  active: z.boolean().optional(),
}).strict()

export const passTypeInput = z.object({
  name: z.string().trim().min(1).max(80), // not-policy: the table's own bound
  description: z.string().trim().max(600).nullable().optional(), // not-policy: a short paragraph on the public page
  covers: z.enum(COVERS),
  seasonId: z.string().min(3).max(40).nullable().optional(), // not-policy: an id
  coversFrom: z.number().int().positive().nullable().optional(),
  coversUntil: z.number().int().positive().nullable().optional(),
  productionIds: z.array(z.string().min(3).max(40)).max(200).optional(), // not-policy: an id; a season's worth of shows and more
  perShow: z.enum(PER_SHOW),
  uses: z.number().int().min(1).max(10_000).nullable().optional(), // not-policy: a sanity bound
  holder: z.enum(HOLDERS).optional(),
  reserveUnpaid: z.boolean().optional(),
  bookAhead: z.boolean().optional(),
  recheck: z.boolean().optional(),
  channel: z.enum(CHANNELS).optional(),
  onSale: z.boolean().optional(),
  saleFrom: z.number().int().positive().nullable().optional(),
  saleUntil: z.number().int().positive().nullable().optional(),
  prices: z.array(priceInput).min(1).max(20), // not-policy: a pass has at least one price; twenty is more than a list can show
}).strict()
export type PassTypeInput = z.infer<typeof passTypeInput>

const TAKEN = { code: 'box-office.pass.name-taken', reason: 'There is already a pass with that name.', fields: { name: 'Choose another name.' } }

/** The input with what its kind of cover does not use blanked, or a refusal that names the field. */
async function checked(input: PassTypeInput): Promise<PassTypeInput & { productionIds: string[] }> {
  const productionIds = input.covers === 'productions' ? [...new Set(input.productionIds ?? [])] : []
  if (input.covers === 'productions' && !productionIds.length)
    refuse('box-office.pass.no-shows', 'Choose the shows this pass covers.', { status: 422, fields: { productionIds: 'Choose at least one show.' } })
  if (input.covers === 'season' && !input.seasonId)
    refuse('box-office.pass.no-season', 'Choose the season this pass covers.', { status: 422, fields: { seasonId: 'Choose a season.' } })
  if (input.covers === 'dates' && (!input.coversFrom || !input.coversUntil))
    refuse('box-office.pass.no-dates', 'Say which dates this pass covers.', { status: 422, fields: { [input.coversFrom ? 'coversUntil' : 'coversFrom']: 'Choose a date.' } })
  if (input.coversFrom && input.coversUntil && input.coversUntil <= input.coversFrom)
    refuse('box-office.pass.window', 'The pass ends before it starts.', { status: 422, fields: { coversUntil: 'After the start.' } })
  if (input.saleFrom && input.saleUntil && input.saleUntil <= input.saleFrom)
    refuse('box-office.pass.sale-window', 'The pass goes off sale before it goes on.', { status: 422, fields: { saleUntil: 'After the start.' } })
  const names = input.prices.map(p => p.name.toLowerCase())
  const twice = names.findIndex((n, i) => names.indexOf(n) !== i)
  if (twice >= 0) refuse('box-office.pass.price-twice', 'Two of its prices have the same name.', { status: 422, fields: { [`prices.${twice}.name`]: 'Choose another name.' } })
  const refs = [...new Set(input.prices.flatMap(p => p.requirementRefs ?? []))]
  if (refs.length) {
    const known = await requirements.describe(refs)
    const bad = input.prices.findIndex(p => (p.requirementRefs ?? []).some(r => !known[r]))
    if (bad >= 0) refuse('box-office.pass.unknown-requirement', 'One of those is not provided by anything switched on.', { status: 422, fields: { [`prices.${bad}.requirementRefs`]: 'Choose from the list.' } })
  }
  const wanted = [...new Set(input.prices.flatMap(p => p.insteadOf ?? []))]
  if (wanted.length) {
    const known = new Set((await all<{ id: string }>('SELECT id FROM box_office_ticket_types WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(wanted))).map(r => r.id))
    const bad = input.prices.findIndex(p => (p.insteadOf ?? []).some(id => !known.has(id)))
    if (bad >= 0) refuse('box-office.pass.unknown-ticket-type', 'One of those ticket types is no longer there.', { status: 422, fields: { [`prices.${bad}.insteadOf`]: 'Choose from the list.' } })
  }
  // A pass only its holder may use cannot be sold to nobody in particular, so it is refused where it would be: when sold.
  return {
    ...input, productionIds,
    seasonId: input.covers === 'season' ? input.seasonId : null,
    // Dates also bound a pass that covers named shows or a season, when given.
    coversFrom: input.coversFrom ?? null, coversUntil: input.coversUntil ?? null,
  }
}

function writePrices(unit: UnitView, passTypeId: string, prices: PassTypeInput['prices'], existing: readonly { id: string, sold: number }[], at: number): void {
  const kept = new Set(prices.map(p => p.id).filter(Boolean))
  for (const old of existing) {
    if (kept.has(old.id)) continue
    // A price passes were sold at stays, retired, so they keep its name; one never used goes.
    if (old.sold) unit.add(sql`UPDATE box_office_pass_prices SET active = 0, updated_at = ${at} WHERE id = ${old.id} AND pass_type_id = ${passTypeId}`)
    else unit.add(sql`DELETE FROM box_office_pass_prices WHERE id = ${old.id} AND pass_type_id = ${passTypeId} AND NOT EXISTS (SELECT 1 FROM box_office_passes WHERE pass_price_id = ${old.id})`)
  }
  prices.forEach((p, sort) => {
    if (p.id) {
      unit.add(sql`UPDATE box_office_pass_prices SET name = ${p.name}, amount_minor = ${p.amountMinor}, requirement_refs = ${refsText(p.requirementRefs)}, proof_note = ${p.proofNote ?? null}, instead_of = ${refsText(p.insteadOf)}, sort = ${sort}, active = ${(p.active ?? true) ? 1 : 0}, updated_at = ${at}
        WHERE id = ${p.id} AND pass_type_id = ${passTypeId}`).expect(1, { code: 'box-office.pass.price-not-found', reason: 'One of these prices is no longer there.', remedy: 'Reload and try again.' })
    }
    else {
      unit.add(sql`INSERT INTO box_office_pass_prices (id, pass_type_id, name, amount_minor, requirement_refs, proof_note, instead_of, sort, active, created_at, updated_at)
        VALUES (${newId('ppr')}, ${passTypeId}, ${p.name}, ${p.amountMinor}, ${refsText(p.requirementRefs)}, ${p.proofNote ?? null}, ${refsText(p.insteadOf)}, ${sort}, ${(p.active ?? true) ? 1 : 0}, ${at}, ${at})`)
    }
  })
}

function writeShows(unit: UnitView, passTypeId: string, productionIds: readonly string[], at: number): void {
  unit.add(sql`DELETE FROM box_office_pass_shows WHERE pass_type_id = ${passTypeId}`)
  for (const productionId of productionIds)
    unit.add(sql`INSERT INTO box_office_pass_shows (id, pass_type_id, production_id, created_at) VALUES (${newId('psh')}, ${passTypeId}, ${productionId}, ${at})`)
}

export async function createPassType(unit: UnitView, input: PassTypeInput, currency: string, actorId: string | null): Promise<string> {
  const c = await checked(input)
  const id = newId('pty')
  const at = nowMs()
  unit.add(sql`INSERT INTO box_office_pass_types (id, name, description, covers, season_id, covers_from, covers_until, per_show, uses, holder, reserve_unpaid, book_ahead, recheck, channel, on_sale, sale_from, sale_until, active, currency, created_by, created_at, updated_at)
    SELECT ${id}, ${c.name}, ${c.description ?? null}, ${c.covers}, ${c.seasonId ?? null}, ${c.coversFrom ?? null}, ${c.coversUntil ?? null}, ${c.perShow}, ${c.uses ?? null}, ${c.holder ?? 'auto'}, ${(c.reserveUnpaid ?? true) ? 1 : 0}, ${(c.bookAhead ?? true) ? 1 : 0}, ${c.recheck ? 1 : 0}, ${c.channel ?? 'all'}, ${c.onSale ? 1 : 0}, ${c.saleFrom ?? null}, ${c.saleUntil ?? null}, 1, ${currency}, ${actorId}, ${at}, ${at}
    WHERE NOT EXISTS (SELECT 1 FROM box_office_pass_types WHERE lower(name) = lower(${c.name}))`).expect(1, TAKEN)
  writePrices(unit, id, c.prices.map(p => ({ ...p, id: undefined })), [], at)
  writeShows(unit, id, c.productionIds, at)
  unit.audit({ action: 'create', record: ['box-office.pass-type', id] })
  return id
}

/**
 * Changes a pass. Passes already held keep what they were sold with: their price, their allowance
 * and whether they are one performance of each show. What it covers applies to them from now on.
 */
export async function updatePassType(unit: UnitView, id: string, input: PassTypeInput): Promise<void> {
  const c = await checked(input)
  const now = await getPassType(id)
  const at = nowMs()
  unit.add(sql`UPDATE box_office_pass_types SET name = ${c.name}, description = ${c.description ?? null}, covers = ${c.covers}, season_id = ${c.seasonId ?? null}, covers_from = ${c.coversFrom ?? null}, covers_until = ${c.coversUntil ?? null},
    per_show = ${c.perShow}, uses = ${c.uses ?? null}, holder = ${c.holder ?? now.holder}, reserve_unpaid = ${(c.reserveUnpaid ?? now.reserveUnpaid) ? 1 : 0}, book_ahead = ${(c.bookAhead ?? now.bookAhead) ? 1 : 0}, recheck = ${(c.recheck ?? now.recheck) ? 1 : 0}, channel = ${c.channel ?? now.channel},
    on_sale = ${(c.onSale ?? now.onSale) ? 1 : 0}, sale_from = ${c.saleFrom ?? null}, sale_until = ${c.saleUntil ?? null}, updated_at = ${at}
    WHERE id = ${id} AND NOT EXISTS (SELECT 1 FROM box_office_pass_types WHERE lower(name) = lower(${c.name}) AND id <> ${id})`).expect(1, TAKEN)
  writePrices(unit, id, c.prices, now.prices, at)
  writeShows(unit, id, c.productionIds, at)
  unit.audit({ action: 'update', record: ['box-office.pass-type', id] })
}

/** Retires a pass, or brings it back. A retired pass is not sold; passes people hold keep working. */
export function setPassTypeActive(unit: UnitView, id: string, active: boolean): void {
  unit.add(sql`UPDATE box_office_pass_types SET active = ${active ? 1 : 0}, updated_at = ${nowMs()} WHERE id = ${id}`)
    .expect(1, { code: 'box-office.pass.not-found', reason: 'There is no such pass.' })
  unit.audit({ action: 'state', record: ['box-office.pass-type', id], detail: { active } })
}

/** Puts a pass on sale, or takes it off. */
export function setPassTypeOnSale(unit: UnitView, id: string, onSale: boolean): void {
  unit.add(sql`UPDATE box_office_pass_types SET on_sale = ${onSale ? 1 : 0}, updated_at = ${nowMs()} WHERE id = ${id} AND active = 1`)
    .expect(1, { code: 'box-office.pass.not-found', reason: 'There is no such pass, or it is retired.' })
  unit.audit({ action: 'state', record: ['box-office.pass-type', id], detail: { onSale } })
}
