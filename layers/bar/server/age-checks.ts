// The age check and the refusals register (Bar specification, tab 4, "The age check and refusals").
// A sale with a restricted line cannot start its payment until the seller has answered the prompt,
// and that answer is logged once per sale. A refusal is recorded on its own, with a reason from the
// theatre's list, the product refused and, only where the theatre has switched it on, a short
// description of the person. The description is shown on the register and nowhere else: it never
// goes into an audit entry, an event, a notification or a report.
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, retentionSeconds, useSetting, type UnitView } from '#kit'
import { accountLabel, assertTerm, operatingDayOf } from '#modules/core'
import { ageChecks, DESCRIPTION_MAX } from './db/schema'
import { ensureOpening } from './openings'

export const REASONS = 'bar.refusal-reason'

export async function ageCheckSettings(): Promise<{ enabled: boolean, challengeAge: number, description: boolean }> {
  return {
    enabled: await useSetting('bar.age-check.enabled') as boolean,
    challengeAge: await useSetting('bar.age-check.challenge-age') as number,
    description: await useSetting('bar.age-check.description') as boolean,
  }
}

/** Logs the seller's answer for a sale, in the batch that starts its payment, unless it is already logged. */
export function recordSaleCheck(unit: UnitView, saleId: string, outcome: 'not_needed' | 'id_checked', variantId: string, by: string | null, at: number): void {
  unit.add({
    sql: `INSERT INTO bar_age_checks (id, opening_id, sale_id, outcome, refusal_term, variant_id, description, by, at, created_at)
          SELECT ?, s.opening_id, s.id, ?, NULL, ?, NULL, ?, ?, ? FROM bar_sales s
           WHERE s.id = ? AND NOT EXISTS (SELECT 1 FROM bar_age_checks WHERE sale_id = ? AND outcome <> 'refused')`,
    params: [newId('bage'), outcome, variantId, by, at, at, saleId, saleId],
  })
}

export const refusalInput = z.object({
  outletId: z.string().min(1).max(64), // not-policy: an id's length
  // The product refused: the line that raised the prompt, or one the seller picks. Optional.
  variantId: z.string().min(1).max(64).nullable().optional(), // not-policy: an id's length
  reasonTermId: z.string().min(1).max(64), // not-policy: an id's length
  description: z.string().trim().max(DESCRIPTION_MAX).nullable().optional(),
  // The basket the refusal was made from, when the rest of it carries on to a sale.
  basketKey: z.string().min(16).max(64).nullable().optional(), // not-policy: a basket key's length
}).strict()
export type RefusalInput = z.infer<typeof refusalInput>

/**
 * Records a refusal at an outlet, opening it if it is not trading. Any sale can be refused, and a
 * customer turned away before anything was rung up is recorded the same way, with no sale.
 */
export async function recordRefusal(unit: UnitView, input: RefusalInput, by: string | null): Promise<string> {
  const settings = await ageCheckSettings()
  if (!settings.enabled) refuse('bar.age-check.off', 'The refusals register is switched off.', { status: 409, remedy: 'Ask a bar manager to switch the age check on.' })
  const description = input.description?.trim() || null
  if (description && !settings.description)
    refuse('bar.age-check.description-off', 'This theatre does not keep a description of the person refused.', { status: 422, remedy: 'Leave the description empty.' })
  const outlet = await first<{ id: string }>('SELECT id FROM bar_outlets WHERE id = ? AND active = 1', input.outletId)
  if (!outlet) refuse('bar.outlet.unknown', 'That outlet is not selling.', { status: 409, remedy: 'Choose another outlet.' })
  if (input.variantId && !await first('SELECT 1 FROM bar_variants WHERE id = ?', input.variantId))
    refuse('bar.variant.unknown', 'There is no such product.', { status: 422 })

  const at = nowMs()
  const id = newId('bage')
  await ensureOpening(unit, input.outletId, by, at)
  unit.add(sql`INSERT INTO bar_age_checks (id, opening_id, sale_id, outcome, refusal_term, variant_id, basket_key, description, by, at, created_at)
    SELECT ${id}, o.id, NULL, 'refused', ${input.reasonTermId}, ${input.variantId ?? null}, ${input.basketKey ?? null}, ${description}, ${by}, ${at}, ${at}
      FROM bar_openings o WHERE o.outlet_id = ${input.outletId} AND o.state = 'open' AND ${assertTerm(input.reasonTermId, REASONS)}`)
    .expect(1, { code: 'bar.age-check.bad-reason', reason: 'That reason is not on the list.', remedy: 'Choose a reason from the list.' })
  // The audit entry and the event say a refusal was recorded, never what the description says.
  unit.audit({ action: 'create', record: ['bar.age-check', id], detail: { outcome: 'refused', outletId: input.outletId, described: !!description } })
  const opening = await first<{ id: string }>("SELECT id FROM bar_openings WHERE outlet_id = ? AND state = 'open'", input.outletId)
  unit.announce('bar.age-check.refused', { ageCheckId: id, openingId: opening?.id ?? '' }, { record: ['bar.age-check', id] })
  return id
}

export interface RegisterRow {
  id: string
  at: number
  outlet: string
  outcome: 'not_needed' | 'id_checked' | 'self_attested' | 'refused'
  reason: string | null
  product: string | null
  by: string
  sale: string | null
  description: string | null
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/ // not-policy: a local date's shape

export const registerFilters = z.object({
  from: z.string().regex(LOCAL_DATE).optional(),
  to: z.string().regex(LOCAL_DATE).optional(),
  outlet: z.string().min(1).max(64).optional(), // not-policy: an id's length
  outcome: z.enum(['not_needed', 'id_checked', 'self_attested', 'refused']).optional(),
}).strict()

const PAGE = 200 // not-policy: one screen of the register

/** The register, newest first, filtered by operating day, outlet and outcome. */
export async function register(filters: z.infer<typeof registerFilters>): Promise<RegisterRow[]> {
  const rows = await all<Omit<RegisterRow, 'by'> & { byId: string | null }>(
    `SELECT a.id, a.at, t.name AS outlet, a.outcome, term.label AS reason,
            CASE WHEN v.id IS NULL THEN NULL WHEN v.name = 'Each' THEN p.name ELSE p.name || ', ' || v.name END AS product,
            a.by AS byId, coalesce(s.reference, k.reference) AS sale, a.description
       FROM bar_age_checks a
       JOIN bar_openings o ON o.id = a.opening_id
       JOIN bar_outlets t ON t.id = o.outlet_id
       LEFT JOIN core_terms term ON term.id = a.refusal_term
       LEFT JOIN bar_variants v ON v.id = a.variant_id
       LEFT JOIN bar_products p ON p.id = v.product_id
       LEFT JOIN bar_sales s ON s.id = a.sale_id
       LEFT JOIN bar_sales k ON k.client_key = a.basket_key
      WHERE (? IS NULL OR o.operating_day >= ?) AND (? IS NULL OR o.operating_day <= ?)
        AND (? IS NULL OR o.outlet_id = ?) AND (? IS NULL OR a.outcome = ?)
      ORDER BY a.at DESC, a.id DESC LIMIT ?`,
    filters.from ?? null, filters.from ?? null, filters.to ?? null, filters.to ?? null,
    filters.outlet ?? null, filters.outlet ?? null, filters.outcome ?? null, filters.outcome ?? null, PAGE,
  )
  const names = new Map<string, string>()
  for (const id of new Set(rows.map(r => r.byId).filter((x): x is string => !!x))) names.set(id, await accountLabel(id))
  return rows.map(({ byId, ...r }) => ({ ...r, by: byId ? names.get(byId) ?? '' : '' }))
}

export interface Review { id: string, outlet: string | null, fromDay: string, toDay: string, refusals: number, by: string, at: number }

/** A sale's age checks: the answer that let it through and any refusal made from its basket. */
export async function checksForSale(saleId: string): Promise<{ outcome: RegisterRow['outcome'], reason: string | null, product: string | null, at: number }[]> {
  return await all(
    `SELECT a.outcome, term.label AS reason,
            CASE WHEN v.id IS NULL THEN NULL WHEN v.name = 'Each' THEN p.name ELSE p.name || ', ' || v.name END AS product, a.at
       FROM bar_age_checks a
       LEFT JOIN core_terms term ON term.id = a.refusal_term
       LEFT JOIN bar_variants v ON v.id = a.variant_id
       LEFT JOIN bar_products p ON p.id = v.product_id
      WHERE a.sale_id = ? OR a.basket_key = (SELECT client_key FROM bar_sales WHERE id = ?)
      ORDER BY a.at, a.id`,
    saleId, saleId,
  )
}

/** The signatures, newest first. */
export async function reviews(limit = 20): Promise<Review[]> { // not-policy: the signatures shown above the register
  const rows = await all<Omit<Review, 'by'> & { byId: string | null }>(
    `SELECT r.id, t.name AS outlet, r.from_day AS fromDay, r.to_day AS toDay, r.refusals, r.reviewed_by AS byId, r.reviewed_at AS at
       FROM bar_register_reviews r LEFT JOIN bar_outlets t ON t.id = r.outlet_id
      ORDER BY r.reviewed_at DESC, r.id DESC LIMIT ?`,
    limit,
  )
  return await Promise.all(rows.map(async ({ byId, ...r }) => ({ ...r, by: byId ? await accountLabel(byId) : '' })))
}

export const reviewInput = z.object({
  fromDay: z.string().regex(LOCAL_DATE),
  toDay: z.string().regex(LOCAL_DATE),
  outletId: z.string().min(1).max(64).nullable().optional(), // not-policy: an id's length
}).strict()

/** How many refusals a signature over these days would cover. */
export async function refusalsIn(input: z.infer<typeof reviewInput>): Promise<number> {
  const row = await first<{ n: number }>(
    `SELECT count(*) AS n FROM bar_age_checks a JOIN bar_openings o ON o.id = a.opening_id
      WHERE a.outcome = 'refused' AND o.operating_day BETWEEN ? AND ? AND (? IS NULL OR o.outlet_id = ?)`,
    input.fromDay, input.toDay, input.outletId ?? null, input.outletId ?? null,
  )
  return row?.n ?? 0
}

/** Signs the register as checked for a range of operating days, recording the refusals it covered. */
export async function sign(unit: UnitView, input: z.infer<typeof reviewInput>, by: string | null): Promise<{ id: string, refusals: number }> {
  if (input.toDay < input.fromDay) refuse('bar.age-check.bad-days', 'The last day is before the first.', { status: 422 })
  const today = await operatingDayOf(nowMs())
  if (input.toDay > today) refuse('bar.age-check.future', 'Days that have not happened yet cannot be signed as checked.', { status: 422 })
  const refusals = await refusalsIn(input)
  const id = newId('brev')
  const at = nowMs()
  unit.add({
    sql: 'INSERT INTO bar_register_reviews (id, outlet_id, from_day, to_day, refusals, reviewed_by, reviewed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    params: [id, input.outletId ?? null, input.fromDay, input.toDay, refusals, by, at, at],
  })
  unit.audit({ action: 'create', record: ['bar.register-review', id], detail: { fromDay: input.fromDay, toDay: input.toDay, refusals } })
  return { id, refusals }
}

/** Erases the description on one row. The audit entry says who and when, never the words. */
export function eraseDescription(unit: UnitView, id: string): void {
  unit.add({ sql: 'UPDATE bar_age_checks SET description = NULL WHERE id = ? AND description IS NOT NULL', params: [id] })
    .expect(1, { code: 'bar.age-check.nothing-to-erase', reason: 'That row has no description.', remedy: 'Refresh the register.' })
  unit.audit({ action: 'erase', record: ['bar.age-check', id], detail: { column: 'description' } })
}

/** The daily sweep: descriptions go once their rows pass the register's retention. */
export async function sweep(unit: UnitView): Promise<void> {
  const kept = await retentionSeconds(ageChecks)
  if (kept === null) return
  unit.add({ sql: 'UPDATE bar_age_checks SET description = NULL WHERE description IS NOT NULL AND at < ?', params: [nowMs() - kept * 1000] }) // not-policy: seconds to milliseconds
}
