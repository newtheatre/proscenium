// Selling (Bar specification, tab 3, "A bar sale" and "One payment for drinks, with or without
// tickets"). The bar takes no money: its panel in Payments' till names what is in the basket, and
// preparing it writes a bar sale awaiting payment in the batch that makes the intent. Payments then
// calls the settlement handler: the sale is paid and its income returned, in Payments' own batch; or
// it is released, and the sale is open again with its lines kept, to pay another way or change.
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, requireAbility, useContext, useSetting, type UnitView } from '#kit'
import type { DeskContext } from '#modules/payments'
import { ageCheckSettings, recordSaleCheck } from './age-checks'
import { priceLists, pricesFor } from './catalogue'
import { choiceGroups, groupsByProduct, pickInput, priceGroups, resolvePicks, type Picked } from './choices'
import { lessPercent } from './pricing'
import { ensureOpening } from './openings'
import { ID_TYPES, saleLineChoices, saleLines } from './db/schema'

const MAX_LINES = 50 // not-policy: one basket's lines, far beyond a round of drinks
const MAX_QUANTITY = 99 // not-policy: one line's quantity
const MAX_PICKS = 10 // not-policy: picks on one line

export const panelInput = z.object({
  outletId: z.string().min(1).max(64), // not-policy: an id's length
  priceListId: z.string().min(1).max(64).optional(), // not-policy: an id's length
  // Made on the device for one basket; a payment tried again for the same basket reuses its sale.
  clientKey: z.string().min(8).max(64), // not-policy: a device key's length
  lines: z.array(z.object({
    variantId: z.string().min(1).max(64), // not-policy: an id's length
    quantity: z.number().int().min(1).max(MAX_QUANTITY),
    // What was picked on the line (a mixer, a premium gin). Different picks make different lines.
    choices: z.array(pickInput).max(MAX_PICKS).optional(),
  }).strict()).min(1).max(MAX_LINES),
  expectedTotalMinor: z.number().int().min(0),
  // The seller's answer to the age prompt, when a line needs one. A refusal is recorded on its own.
  ageCheck: z.enum(['not_needed', 'id_checked']).optional(),
  // Which ID was shown, when the seller says.
  idType: z.enum(ID_TYPES).optional(),
}).strict()
export type PanelInput = z.infer<typeof panelInput>

function parse(value: unknown): PanelInput {
  const parsed = panelInput.safeParse(value)
  if (!parsed.success) refuse('bar.panel.bad-input', 'The bar panel was not filled in properly.', { status: 422 })
  return parsed.data!
}

interface Outlet { id: string, name: string, price_list_id: string }
interface Priced { variantId: string, quantity: number, label: string, unitMinor: number, amountMinor: number, priceId: string, categoryId: string, ageRestricted: boolean, choices: Picked[] }

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
  // Lines with the same size and the same picks are one line.
  const merged = new Map<string, { variantId: string, quantity: number, choices: PanelInput['lines'][number]['choices'] }>()
  for (const l of input.lines) {
    const key = [l.variantId, ...(l.choices ?? []).map(c => `${c.groupId}:${c.key}`).sort()].join('|')
    const at = merged.get(key)
    if (at) at.quantity += l.quantity
    else merged.set(key, { variantId: l.variantId, quantity: l.quantity, choices: l.choices })
  }
  const ids = [...new Set([...merged.values()].map(m => m.variantId))]
  const named = await all<{ id: string, variant: string, product: string, product_id: string, category_id: string, age_restricted: number, sizes: number }>(
    `SELECT v.id, v.name AS variant, p.name AS product, p.id AS product_id, p.category_id, (CASE WHEN p.age_from_category = 1 THEN c.age_restricted ELSE p.age_restricted END) AS age_restricted,
            (SELECT count(*) FROM bar_variants w WHERE w.product_id = p.id AND w.active = 1 AND w.mixer_measure = 0) AS sizes
       FROM bar_variants v JOIN bar_products p ON p.id = v.product_id JOIN bar_categories c ON c.id = p.category_id
      WHERE v.id IN (SELECT value FROM json_each(?)) AND v.active = 1 AND v.mixer_measure = 0 AND p.active = 1 AND c.active = 1`,
    JSON.stringify(ids),
  )
  const byId = new Map(named.map(n => [n.id, n]))
  const attached = await groupsByProduct([...new Set(named.map(n => n.product_id))])
  const anyChoices = [...merged.values()].some(m => m.choices?.length) || [...attached.values()].some(g => g.length)
  // A percentage list rounds once, on the whole unit price: the size and its picks at Standard, less the percentage.
  const list = (await priceLists()).find(l => l.id === priceListId)
  const percent = list && !list.standard && list.percentOff !== null ? list.percentOff : null
  const baseListId = percent !== null ? (await priceLists()).find(l => l.standard)!.id : priceListId
  const groups = new Map<string, Awaited<ReturnType<typeof choiceGroups>>[number]>()
  if (anyChoices) {
    const all = await choiceGroups({ activeOnly: true })
    const mixerIds = all.filter(g => g.source === 'mixers').flatMap(g => g.options.map(o => o.key))
    const mixerPrices = mixerIds.length ? await pricesFor(mixerIds, baseListId) : new Map()
    for (const g of priceGroups(all, v => mixerPrices.get(v)?.amountMinor ?? null)) groups.set(g.id, g)
  }
  const prices = await pricesFor(ids, baseListId)
  const lines = [...merged.values()].map((m): Priced => {
    const n = byId.get(m.variantId)
    if (!n) refuse('bar.variant.not-on-sale', 'Something in the basket is no longer on sale.', { status: 409, remedy: 'Take it out and add it again.' })
    const sized = n!.sizes === 1 && n!.variant === 'Each' ? n!.product : `${n!.product}, ${n!.variant}`
    const price = prices.get(m.variantId)
    if (!price) refuse('bar.variant.no-price', `${sized} has no price on this list.`, { status: 409, remedy: 'Take it out, or ask for a price to be set.' })
    const choices = resolvePicks(sized, attached.get(n!.product_id) ?? [], groups, m.choices ?? [])
    const before = price!.amountMinor + choices.reduce((s, c) => s + c.deltaMinor, 0)
    const unitMinor = percent !== null ? lessPercent(before, percent) : before
    const label = choices.length ? `${sized} · ${choices.map(c => c.label).join(', ')}` : sized
    return {
      variantId: m.variantId, quantity: m.quantity, label, unitMinor, amountMinor: unitMinor * m.quantity, priceId: price!.priceId, categoryId: n!.category_id,
      // The line needs the age check when the product does, or anything picked on it does.
      ageRestricted: !!n!.age_restricted || choices.some(c => c.ageRestricted),
      choices,
    }
  })
  return { outlet, priceListId, lines, totalMinor: lines.reduce((s, l) => s + l.amountMinor, 0) }
}

/** The panel's lines, for the till to show. Reads only. */
export async function deskSummary(context: Pick<DeskContext, 'input'>): Promise<{ lines: { label: string, amountMinor: number, quantity: number, item: string }[], amountMinor: number }> {
  const { lines, totalMinor } = await priced(parse(context.input))
  return { lines: lines.map(l => ({ label: l.quantity > 1 ? `${l.quantity} × ${l.label}` : l.label, amountMinor: l.amountMinor, quantity: l.quantity, item: l.label })), amountMinor: totalMinor }
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
  // A restricted list (committee prices) is sold from only by someone allowed to.
  const list = (await priceLists()).find(l => l.id === priceListId)
  if (list?.restricted) await requireAbility(actor, 'bar.sale.use-restricted-price-list', ['bar.outlet', input.outletId])
  if (totalMinor !== input.expectedTotalMinor)
    refuse('bar.sale.total-changed', `The total is ${totalMinor} now, not ${input.expectedTotalMinor}.`, { status: 409, remedy: 'Check the basket and take payment again.' })
  if (totalMinor <= 0) refuse('bar.sale.zero', 'There is nothing to pay for in the bar basket.', { status: 422 })
  const restricted = lines.find(l => l.ageRestricted)
  const checks = await ageCheckSettings()
  if (restricted && checks.enabled && !input.ageCheck)
    refuse('bar.age-check.unanswered', `${restricted.label} needs an age check.`, { status: 409, remedy: 'Answer the age check, or refuse the sale.' })
  // A customer refused from this basket is not served age-restricted drinks from it afterwards.
  if (restricted && await first('SELECT 1 FROM bar_age_checks WHERE basket_key = ? AND outcome = \'refused\'', input.clientKey))
    refuse('bar.age-check.refused-basket', `${restricted.label} cannot be sold: this customer was refused.`, { status: 409, remedy: 'Take the age-restricted drinks off, or start a new customer.' })

  const at = nowMs()
  const existing = await first<{ id: string, state: string, opening_id: string }>('SELECT id, state, opening_id FROM bar_sales WHERE client_key = ?', input.clientKey)
  let saleId: string
  if (existing) {
    if (existing.state !== 'open') refuse(SALE_GONE.code, SALE_GONE.reason, { status: 409, remedy: SALE_GONE.remedy })
    saleId = existing.id
    unit.add({ sql: 'DELETE FROM bar_sale_line_choices WHERE sale_line_id IN (SELECT id FROM bar_sale_lines WHERE sale_id = ?)', params: [saleId] })
    unit.add({ sql: 'DELETE FROM bar_sale_lines WHERE sale_id = ?', params: [saleId] })
  }
  else {
    saleId = newId('bsal')
    // The outlet starts trading with its first sale (tab 3, "An opening": at the desk, and here at any outlet).
    await ensureOpening(unit, outlet.id, actor.accountId ?? null, at)
    unit.add({
      sql: `INSERT INTO bar_sales (id, reference, opening_id, price_list_id, state, total_minor, currency, channel, sold_by, client_key, created_at, updated_at)
            SELECT ?, ?, o.id, ?, 'open', 0, ?, 'desk', ?, ?, ?, ? FROM bar_openings o WHERE o.outlet_id = ? AND o.state = 'open'`,
      params: [saleId, await reference(), priceListId, await useSetting('core.locale.currency') as string, actor.accountId, input.clientKey, at, at, outlet.id],
    }).expect(1, SALE_GONE)
  }
  const lineIds = unit.insertSet(saleLines, lines.map(l => ({ saleId, variantId: l.variantId, priceId: l.priceId, quantity: l.quantity, unitMinor: l.unitMinor, discountMinor: 0, amountMinor: l.amountMinor })))
  const picks = lines.flatMap((l, i) => l.choices.map(c => ({ saleLineId: lineIds[i]!, groupId: c.groupId, optionId: c.optionId, mixerVariantId: c.mixerVariantId, label: c.label, deltaMinor: c.deltaMinor })))
  if (picks.length) unit.insertSet(saleLineChoices, picks)
  unit.add({
    sql: "UPDATE bar_sales SET state = 'awaiting_payment', updated_at = ? WHERE id = ? AND state = 'open' AND total_minor = ?",
    params: [at, saleId, totalMinor],
  }).expect(1, SALE_GONE)
  // Once per sale: a payment tried again for the same basket does not log a second check.
  if (restricted && checks.enabled) recordSaleCheck(unit, saleId, input.ageCheck!, restricted.variantId, actor.accountId ?? null, at, input.ageCheck === 'id_checked' ? input.idType ?? null : null)
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
