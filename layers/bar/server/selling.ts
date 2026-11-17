// Selling (Bar specification, tab 3, "A bar sale" and "One payment for drinks, with or without
// tickets"). The bar takes no money: its panel in Payments' till names what is in the basket, and
// preparing it writes a bar sale awaiting payment in the batch that makes the intent. Payments then
// calls the settlement handler: the sale is paid and its income returned, in Payments' own batch; or
// it is released, and the sale is open again with its lines kept, to pay another way or change.
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, requireAbility, useContext, useSetting, type UnitView } from '#kit'
import { operatingDayOf } from '#modules/core'
import type { DeskContext } from '#modules/payments'
import { pricesFor } from './catalogue'
import { saleLines } from './db/schema'

const MAX_LINES = 50 // not-policy: one basket's lines, far beyond a round of drinks
const MAX_QUANTITY = 99 // not-policy: one line's quantity

export const panelInput = z.object({
  outletId: z.string().min(1).max(64), // not-policy: an id's length
  priceListId: z.string().min(1).max(64).optional(), // not-policy: an id's length
  // Made on the device for one basket; a payment tried again for the same basket reuses its sale.
  clientKey: z.string().min(8).max(64), // not-policy: a device key's length
  lines: z.array(z.object({ variantId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(MAX_QUANTITY) }).strict()).min(1).max(MAX_LINES), // not-policy: an id's length
  expectedTotalMinor: z.number().int().min(0),
}).strict()
export type PanelInput = z.infer<typeof panelInput>

function parse(value: unknown): PanelInput {
  const parsed = panelInput.safeParse(value)
  if (!parsed.success) refuse('bar.panel.bad-input', 'The bar panel was not filled in properly.', { status: 422 })
  return parsed.data!
}

interface Outlet { id: string, name: string, price_list_id: string }
interface Priced { variantId: string, quantity: number, label: string, unitMinor: number, amountMinor: number, priceId: string, categoryId: string }

async function outletFor(id: string): Promise<Outlet> {
  const outlet = await first<Outlet>('SELECT id, name, price_list_id FROM bar_outlets WHERE id = ? AND active = 1', id)
  if (!outlet) refuse('bar.outlet.unknown', 'That outlet is not selling.', { status: 409, remedy: 'Choose another outlet.' })
  return outlet!
}

/** The basket at today's prices on the chosen list (the outlet's own when none is chosen). A size with no price is refused by name. */
async function priced(input: PanelInput): Promise<{ outlet: Outlet, priceListId: string, lines: Priced[], totalMinor: number }> {
  const outlet = await outletFor(input.outletId)
  const priceListId = input.priceListId ?? outlet.price_list_id
  if (priceListId !== outlet.price_list_id) {
    // Choosing another list is the later story BAR-16; only the outlet's own is sold from for now.
    refuse('bar.price-list.not-here', 'This outlet sells from its own price list.', { status: 409 })
  }
  const merged = new Map<string, number>()
  for (const l of input.lines) merged.set(l.variantId, (merged.get(l.variantId) ?? 0) + l.quantity)
  const ids = [...merged.keys()]
  const named = await all<{ id: string, variant: string, product: string, category_id: string, sizes: number }>(
    `SELECT v.id, v.name AS variant, p.name AS product, p.category_id,
            (SELECT count(*) FROM bar_variants w WHERE w.product_id = p.id AND w.active = 1) AS sizes
       FROM bar_variants v JOIN bar_products p ON p.id = v.product_id JOIN bar_categories c ON c.id = p.category_id
      WHERE v.id IN (SELECT value FROM json_each(?)) AND v.active = 1 AND p.active = 1 AND c.active = 1`,
    JSON.stringify(ids),
  )
  const byId = new Map(named.map(n => [n.id, n]))
  const prices = await pricesFor(ids, priceListId)
  const lines = ids.map((variantId): Priced => {
    const n = byId.get(variantId)
    if (!n) refuse('bar.variant.not-on-sale', 'Something in the basket is no longer on sale.', { status: 409, remedy: 'Take it out and add it again.' })
    const label = n!.sizes === 1 && n!.variant === 'Each' ? n!.product : `${n!.product}, ${n!.variant}`
    const price = prices.get(variantId)
    if (!price) refuse('bar.variant.no-price', `${label} has no price on this list.`, { status: 409, remedy: 'Take it out, or ask for a price to be set.' })
    const quantity = merged.get(variantId)!
    return { variantId, quantity, label, unitMinor: price!.amountMinor, amountMinor: price!.amountMinor * quantity, priceId: price!.priceId, categoryId: n!.category_id }
  })
  return { outlet, priceListId, lines, totalMinor: lines.reduce((s, l) => s + l.amountMinor, 0) }
}

/** The panel's lines, for the till to show. Reads only. */
export async function deskSummary(context: DeskContext): Promise<{ lines: { label: string, amountMinor: number }[], amountMinor: number }> {
  const { lines, totalMinor } = await priced(parse(context.input))
  return { lines: lines.map(l => ({ label: l.quantity > 1 ? `${l.quantity} × ${l.label}` : l.label, amountMinor: l.amountMinor })), amountMinor: totalMinor }
}

const SALE_GONE = { code: 'bar.sale.not-open', reason: 'This bar sale is already being paid for, or has finished.', remedy: 'Start a new sale.' }

/**
 * Writes the basket as a bar sale awaiting payment, in the batch that makes the intent: the outlet's
 * opening first if it is not trading, then the sale (or the same sale again, after a payment that did
 * not complete), its lines and the move to awaiting payment. The total must be the one the seller saw.
 */
export async function deskPrepare(unit: UnitView, context: DeskContext): Promise<{ owner: { module: string, record: string }, amountMinor: number }> {
  const input = parse(context.input)
  const { actor } = useContext()
  await requireAbility(actor, 'bar.sale.sell', ['bar.outlet', input.outletId])
  const { outlet, priceListId, lines, totalMinor } = await priced(input)
  if (totalMinor !== input.expectedTotalMinor)
    refuse('bar.sale.total-changed', `The total is ${totalMinor} now, not ${input.expectedTotalMinor}.`, { status: 409, remedy: 'Check the basket and take payment again.' })
  if (totalMinor <= 0) refuse('bar.sale.zero', 'There is nothing to pay for in the bar basket.', { status: 422 })

  const at = nowMs()
  const existing = await first<{ id: string, state: string, opening_id: string }>('SELECT id, state, opening_id FROM bar_sales WHERE client_key = ?', input.clientKey)
  let saleId: string
  if (existing) {
    if (existing.state !== 'open') refuse(SALE_GONE.code, SALE_GONE.reason, { status: 409, remedy: SALE_GONE.remedy })
    saleId = existing.id
    unit.add({ sql: 'DELETE FROM bar_sale_lines WHERE sale_id = ?', params: [saleId] })
  }
  else {
    saleId = newId('bsal')
    // The outlet starts trading with its first sale (tab 3, "An opening": at the desk, and here at any outlet).
    unit.add({
      sql: `INSERT INTO bar_openings (id, outlet_id, performance_id, operating_day, state, opened_by, opened_at, created_at, updated_at)
            SELECT ?, ?, NULL, ?, 'open', ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM bar_openings WHERE outlet_id = ? AND state = 'open')`,
      params: [newId('bopn'), outlet.id, await operatingDayOf(at), actor.accountId, at, at, at, outlet.id],
    })
    unit.add({
      sql: `INSERT INTO bar_sales (id, reference, opening_id, price_list_id, state, total_minor, currency, channel, sold_by, client_key, created_at, updated_at)
            SELECT ?, ?, o.id, ?, 'open', 0, ?, 'desk', ?, ?, ?, ? FROM bar_openings o WHERE o.outlet_id = ? AND o.state = 'open'`,
      params: [saleId, await reference(), priceListId, await useSetting('core.locale.currency') as string, actor.accountId, input.clientKey, at, at, outlet.id],
    }).expect(1, SALE_GONE)
  }
  unit.insertSet(saleLines, lines.map(l => ({ saleId, variantId: l.variantId, priceId: l.priceId, quantity: l.quantity, unitMinor: l.unitMinor, discountMinor: 0, amountMinor: l.amountMinor })))
  unit.add({
    sql: "UPDATE bar_sales SET state = 'awaiting_payment', updated_at = ? WHERE id = ? AND state = 'open' AND total_minor = ?",
    params: [at, saleId, totalMinor],
  }).expect(1, SALE_GONE)
  unit.audit({ action: 'create', record: ['bar.sale', saleId], detail: { outletId: outlet.id, totalMinor } })
  return { owner: { module: 'bar', record: saleId }, amountMinor: totalMinor }
}

/** Puts the till's payment on the sale, so settling and releasing know it. */
export function deskAttach(unit: UnitView, saleId: string, intentId: string): void {
  unit.add({ sql: "UPDATE bar_sales SET intent_id = ?, updated_at = ? WHERE id = ? AND state = 'awaiting_payment'", params: [intentId, nowMs(), saleId] })
    .expect(1, SALE_GONE)
}

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' // not-policy: letters that cannot be misread aloud
const REFERENCE_LENGTH = 5 // not-policy: short enough to read out, with room for millions

/** A short code a person can read out, starting with the theatre's prefix: "B-7K2QX". */
async function reference(): Promise<string> {
  const prefix = await useSetting('bar.sales.reference-prefix') as string
  const bytes = crypto.getRandomValues(new Uint8Array(REFERENCE_LENGTH))
  return `${prefix}-${[...bytes].map(b => ALPHABET[b % ALPHABET.length]).join('')}`
}
