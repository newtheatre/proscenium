// Stocktakes (Bar specification, tab 3, "A stocktake"; tab 10, "Counting by weight"). A count starts
// with a line per item in use (in a category, or all), each counted in base units: typed as count
// units and a part, or as full ones and an open one weighed. What was expected is read from the level
// at the moment each line is counted, so a sale made after a line was typed is not mistaken for stock
// found. Approving writes one adjustment per line that differs, on top of whatever has moved since. The
// approver is not the person who submitted, unless the value of the difference is small, and a large
// difference on a line needs a reason.
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { accountLabel, listTerms } from '#modules/core'
import { writeMovements } from './stock'

export const VARIANCE_REASONS = 'bar.variance-reason'
export type StocktakeState = 'counting' | 'submitted' | 'approved' | 'abandoned'

const id = z.string().min(1).max(64) // not-policy: an id's length
const MAX_LINES = 500 // not-policy: matches core.units.set-rows-limit's default

export const startInput = z.object({ locationId: id, categoryId: id.nullable().optional() }).strict()
export type StartInput = z.infer<typeof startInput>

// A line is counted in base units, or weighed in grams (for an item with weights) with any full ones
// counted beside the open one, or taken out.
const countLine = z.union([
  z.object({ lineId: id, counted: z.number().int().min(0).max(100_000_000) }).strict(), // not-policy: a bound on a typed quantity
  z.object({ lineId: id, weighedG: z.number().int().min(0).max(1_000_000), fullUnits: z.number().min(0).max(100_000).optional() }).strict(), // not-policy: a bound on a typed weight (a tonne) and count
  z.object({ lineId: id, counted: z.null() }).strict(),
  z.object({ lineId: id, notCounted: z.literal(true) }).strict(),
])
export const countInput = z.object({ lines: z.array(countLine).min(1).max(MAX_LINES) }).strict()
export type CountInput = z.infer<typeof countInput>

export const reasonsInput = z.object({ lines: z.array(z.object({ lineId: id, reasonTermId: id.nullable() }).strict()).min(1).max(MAX_LINES) }).strict()
export type ReasonsInput = z.infer<typeof reasonsInput>

export interface StocktakeLine {
  id: string
  stockItemId: string
  name: string
  baseUnit: 'each' | 'ml' | 'g'
  countUnitSize: number
  packSize: number
  packName: string
  weighable: boolean
  fullWeightG: number | null
  emptyWeightG: number | null
  counted: number | null
  // Shown to a counter only when counts are not blind; to an approver always once submitted.
  expected: number | null
  level: number | null
  varianceValueMinor: number | null
  reasonTermId: string | null
}
export interface Stocktake {
  id: string
  locationId: string
  location: string
  state: StocktakeState
  categoryId: string | null
  category: string | null
  startedBy: string
  submittedBy: string | null
  approvedBy: string | null
  startedAt: number
  submittedAt: number | null
  approvedAt: number | null
  varianceValueMinor: number | null
  currency: string
}

const GONE = { code: 'bar.stocktake.unknown', reason: 'There is no such stocktake.' }
const not = (state: string) => ({ code: 'bar.stocktake.state', reason: `This stocktake is not ${state}.`, remedy: 'Reload it to see where it is now.' })

async function row(stocktakeId: string) {
  const r = await first<{ location_id: string, state: StocktakeState, started_by: string, submitted_by: string | null, variance_value_minor: number | null, updated_at: number }>(
    'SELECT location_id, state, started_by, submitted_by, variance_value_minor, updated_at FROM bar_stocktakes WHERE id = ?', stocktakeId,
  )
  if (!r) refuse(GONE.code, GONE.reason, { status: 404 })
  return r!
}

export async function stocktakes(options: { limit?: number } = {}): Promise<Stocktake[]> {
  return await list(null, options.limit ?? 50) // not-policy: a page of recent counts
}

export async function stocktake(stocktakeId: string, view: { approver: boolean }): Promise<{ stocktake: Stocktake, lines: StocktakeLine[], blind: boolean, reasons: { id: string, label: string }[] }> {
  const [s] = await list(stocktakeId, 1)
  if (!s) refuse(GONE.code, GONE.reason, { status: 404 })
  const blind = await useSetting('bar.stocktake.blind') as boolean
  const rows = await all<{ id: string, stock_item_id: string, name: string, base_unit: 'each' | 'ml' | 'g', count_unit_size: number, pack_size: number, pack_name: string, cost_minor: number | null, full_weight_g: number | null, empty_weight_g: number | null, counted: number | null, expected: number | null, level: number | null, reason: string | null }>(
    `SELECT l.id, l.stock_item_id, i.name, i.base_unit, i.count_unit_size, i.pack_size, i.pack_name, i.cost_minor, i.full_weight_g, i.empty_weight_g, l.counted, l.expected,
            (SELECT v.quantity FROM bar_stock_levels v WHERE v.stock_item_id = l.stock_item_id AND v.location_id = ?) AS level, l.variance_reason_term AS reason
       FROM bar_stocktake_lines l JOIN bar_stock_items i ON i.id = l.stock_item_id WHERE l.stocktake_id = ? ORDER BY lower(i.name), l.id`,
    s!.locationId, stocktakeId,
  )
  // While counting, the level is shown only when counts are not blind; once submitted, the expected
  // figure belongs to the review, which an approver sees.
  const showLevel = s!.state === 'counting' && !blind
  const showExpected = s!.state !== 'counting' && (view.approver || !blind)
  return {
    stocktake: s!,
    blind,
    reasons: (await listTerms(VARIANCE_REASONS)).map(t => ({ id: t.id, label: t.label })),
    lines: rows.map(r => ({
      id: r.id, stockItemId: r.stock_item_id, name: r.name, baseUnit: r.base_unit, countUnitSize: r.count_unit_size, packSize: r.pack_size,
      packName: r.pack_name, weighable: r.full_weight_g !== null, fullWeightG: r.full_weight_g, emptyWeightG: r.empty_weight_g, counted: r.counted,
      expected: showExpected ? r.expected : null,
      level: showLevel ? r.level ?? 0 : null,
      varianceValueMinor: showExpected && r.counted !== null && r.expected !== null ? valueOf(r.counted - r.expected, r.cost_minor, r.pack_size) : null,
      reasonTermId: r.reason,
    })),
  }
}

const valueOf = (units: number, costMinor: number | null, packSize: number) => costMinor === null ? 0 : Math.round(units * costMinor / packSize)

async function list(stocktakeId: string | null, limit: number): Promise<Stocktake[]> {
  const rows = await all<{ id: string, location_id: string, location: string, state: StocktakeState, category_id: string | null, category: string | null, started_by: string, submitted_by: string | null, approved_by: string | null, started_at: number, submitted_at: number | null, approved_at: number | null, variance_value_minor: number | null, currency: string }>(
    `SELECT s.id, s.location_id, l.name AS location, s.state, s.category_id, c.name AS category, s.started_by, s.submitted_by, s.approved_by,
            s.started_at, s.submitted_at, s.approved_at, s.variance_value_minor, s.currency
       FROM bar_stocktakes s JOIN bar_stock_locations l ON l.id = s.location_id LEFT JOIN bar_categories c ON c.id = s.category_id
      WHERE ? IS NULL OR s.id = ?
      ORDER BY s.state IN ('counting', 'submitted') DESC, s.started_at DESC, s.id DESC LIMIT ?`,
    stocktakeId, stocktakeId, limit,
  )
  const names = new Map<string, string>()
  for (const who of new Set(rows.flatMap(r => [r.started_by, r.submitted_by, r.approved_by].filter((x): x is string => !!x)))) names.set(who, await accountLabel(who))
  return rows.map(r => ({
    id: r.id, locationId: r.location_id, location: r.location, state: r.state, categoryId: r.category_id, category: r.category,
    startedBy: names.get(r.started_by) ?? '', submittedBy: r.submitted_by ? names.get(r.submitted_by) ?? '' : null, approvedBy: r.approved_by ? names.get(r.approved_by) ?? '' : null,
    startedAt: r.started_at, submittedAt: r.submitted_at, approvedAt: r.approved_at, varianceValueMinor: r.variance_value_minor, currency: r.currency,
  }))
}

/** Starts a count at a location: a line per item in use, or per item in a category and its sub-categories. */
export async function startStocktake(unit: UnitView, input: StartInput, by: string): Promise<string> {
  if (!await first('SELECT 1 FROM bar_stock_locations WHERE id = ? AND active = 1', input.locationId))
    refuse('bar.stock-location.unknown', 'There is no such location in use.', { status: 422, remedy: 'Pick a location that is in use.' })
  if (await first('SELECT 1 FROM bar_stocktakes WHERE location_id = ? AND state IN (\'counting\', \'submitted\')', input.locationId))
    refuse('bar.stocktake.live', 'This location is already being counted.', { status: 409, remedy: 'Finish or abandon that count first.' })
  const category = input.categoryId ?? null
  const items = await all<{ id: string }>(
    'SELECT id FROM bar_stock_items WHERE active = 1 AND (? IS NULL OR category_id IN (SELECT id FROM bar_categories WHERE id = ? OR parent_id = ?))',
    category, category, category,
  )
  if (!items.length) refuse('bar.stocktake.nothing', 'There is nothing to count.', { status: 422, remedy: category ? 'Pick a category with stock items in it.' : 'Add stock items first.' })
  const limit = await useSetting('core.units.set-rows-limit') as number
  if (items.length > limit) refuse('bar.stocktake.too-many', `At most ${limit} items go in one count; this one would have ${items.length}.`, { status: 422, remedy: 'Count by category.' })
  const stocktakeId = newId('bstk')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO bar_stocktakes (id, location_id, state, scope, category_id, started_by, submitted_by, approved_by, started_at, submitted_at, approved_at, variance_value_minor, currency, created_at, updated_at)
          VALUES (?, ?, 'counting', ?, ?, ?, NULL, NULL, ?, NULL, NULL, NULL, ?, ?, ?)`,
    params: [stocktakeId, input.locationId, category ? 'category' : 'full', category, by, at, await useSetting('core.locale.currency') as string, at, at],
  })
  unit.add({
    sql: `INSERT INTO bar_stocktake_lines (id, stocktake_id, stock_item_id, counted, expected, variance_reason_term, created_at, updated_at)
          SELECT json_extract(j.value, '$.id'), ?, json_extract(j.value, '$.i'), NULL, NULL, NULL, ?, ? FROM json_each(?) j`,
    params: [stocktakeId, at, at, JSON.stringify(items.map(i => ({ id: newId('bskl'), i: i.id })))],
  }).expect(items.length, { code: 'bar.stocktake.changed', reason: 'The items changed while the count was starting.', remedy: 'Try again.' })
  unit.audit({ action: 'create', record: ['bar.stocktake', stocktakeId] })
  return stocktakeId
}

/**
 * Enters counts while counting. A weighed line becomes base units from the item's full and empty
 * weights (one count unit each): the full ones counted beside it, plus what is left in the open one,
 * (weighed - empty) / (full - empty) x count unit size, at least nought. Each line counted takes what
 * was expected from its level now, so what sells after it was counted is allowed for. A line taken
 * out is no longer part of the count.
 */
export async function enterCounts(unit: UnitView, stocktakeId: string, input: CountInput): Promise<void> {
  const s = await row(stocktakeId)
  if (s.state !== 'counting') refuse(not('counting').code, not('counting').reason, { status: 409, remedy: not('counting').remedy })
  const lines = new Map((await all<{ id: string, full_weight_g: number | null, empty_weight_g: number | null, count_unit_size: number }>(
    'SELECT l.id, i.full_weight_g, i.empty_weight_g, i.count_unit_size FROM bar_stocktake_lines l JOIN bar_stock_items i ON i.id = l.stock_item_id WHERE l.stocktake_id = ?', stocktakeId,
  )).map(l => [l.id, l]))
  const set: { id: string, counted: number | null }[] = []
  const out: string[] = []
  for (const l of input.lines) {
    const line = lines.get(l.lineId)
    if (!line) refuse('bar.stocktake.unknown-line', 'One of those lines is not on this count.', { status: 422, remedy: 'Reload the count.' })
    if ('notCounted' in l) out.push(l.lineId)
    else if ('weighedG' in l) {
      if (line!.full_weight_g === null) refuse('bar.stocktake.not-weighed', 'That item has no full and empty weights, so it cannot be weighed.', { status: 422, remedy: 'Count it instead, or give it weights in Admin.' })
      const left = Math.max(0, (l.weighedG - line!.empty_weight_g!) / (line!.full_weight_g! - line!.empty_weight_g!) * line!.count_unit_size)
      set.push({ id: l.lineId, counted: Math.round((l.fullUnits ?? 0) * line!.count_unit_size + left) })
    }
    else set.push({ id: l.lineId, counted: l.counted })
  }
  const at = nowMs()
  if (set.length) {
    const json = JSON.stringify(set.map(x => ({ id: x.id, c: x.counted })))
    unit.add({
      sql: `UPDATE bar_stocktake_lines SET counted = (SELECT json_extract(j.value, '$.c') FROM json_each(?) j WHERE json_extract(j.value, '$.id') = bar_stocktake_lines.id),
              expected = CASE WHEN (SELECT json_extract(j.value, '$.c') FROM json_each(?) j WHERE json_extract(j.value, '$.id') = bar_stocktake_lines.id) IS NULL THEN NULL
                ELSE coalesce((SELECT v.quantity FROM bar_stock_levels v WHERE v.stock_item_id = bar_stocktake_lines.stock_item_id AND v.location_id = ?), 0) END,
              updated_at = ?
            WHERE stocktake_id = ? AND id IN (SELECT json_extract(j.value, '$.id') FROM json_each(?) j)
            AND EXISTS (SELECT 1 FROM bar_stocktakes WHERE id = ? AND state = 'counting')`,
      params: [json, json, s.location_id, at, stocktakeId, json, stocktakeId],
    }).expect(set.length, not('counting'))
  }
  if (out.length) {
    unit.add({
      sql: `DELETE FROM bar_stocktake_lines WHERE stocktake_id = ? AND id IN (SELECT value FROM json_each(?))
            AND EXISTS (SELECT 1 FROM bar_stocktakes WHERE id = ? AND state = 'counting')`,
      params: [stocktakeId, JSON.stringify(out), stocktakeId],
    }).expect(out.length, not('counting'))
  }
  unit.add({ sql: 'UPDATE bar_stocktakes SET updated_at = ? WHERE id = ? AND state = \'counting\'', params: [at, stocktakeId] }).expect(1, not('counting'))
}

/** Submits a count with every line counted. A line counted before what was expected was kept with it takes the level now. */
export async function submitStocktake(unit: UnitView, stocktakeId: string, by: string): Promise<void> {
  const s = await row(stocktakeId)
  if (s.state !== 'counting') refuse(not('counting').code, not('counting').reason, { status: 409, remedy: not('counting').remedy })
  const open = await first<{ n: number, all: number }>('SELECT sum(counted IS NULL) AS n, count(*) AS "all" FROM bar_stocktake_lines WHERE stocktake_id = ?', stocktakeId)
  if (!open?.all) refuse('bar.stocktake.empty', 'Nothing is left on this count.', { status: 422, remedy: 'Abandon it instead.' })
  if (open!.n) refuse('bar.stocktake.uncounted', `${open!.n} lines are not counted yet.`, { status: 422, remedy: 'Count them, or take them out of the count.' })
  const at = nowMs()
  unit.add({
    sql: `UPDATE bar_stocktake_lines SET expected = coalesce((SELECT v.quantity FROM bar_stock_levels v WHERE v.stock_item_id = bar_stocktake_lines.stock_item_id AND v.location_id = ?), 0), updated_at = ?
          WHERE stocktake_id = ? AND expected IS NULL`,
    params: [s.location_id, at, stocktakeId],
  })
  unit.add({
    sql: `UPDATE bar_stocktakes SET state = 'submitted', submitted_by = ?, submitted_at = ?, updated_at = ?,
            variance_value_minor = (SELECT coalesce(sum(round(CAST((l.counted - l.expected) * coalesce(i.cost_minor, 0) AS REAL) / i.pack_size)), 0)
                                      FROM bar_stocktake_lines l JOIN bar_stock_items i ON i.id = l.stock_item_id WHERE l.stocktake_id = bar_stocktakes.id)
          WHERE id = ? AND state = 'counting' AND updated_at = ?`,
    params: [by, at, at, stocktakeId, s.updated_at],
  }).expect(1, { code: 'bar.stocktake.changed', reason: 'This count changed while you were submitting it.', remedy: 'Reload it and submit again.' })
  unit.audit({ action: 'update', record: ['bar.stocktake', stocktakeId], detail: { state: 'submitted' } })
}

/** Gives the lines that differ a reason, while the count waits for approval. */
export async function setReasons(unit: UnitView, stocktakeId: string, input: ReasonsInput): Promise<void> {
  const s = await row(stocktakeId)
  if (s.state !== 'submitted') refuse(not('submitted').code, not('submitted').reason, { status: 409, remedy: not('submitted').remedy })
  const json = JSON.stringify(input.lines.map(l => ({ id: l.lineId, r: l.reasonTermId })))
  unit.add({
    sql: `UPDATE bar_stocktake_lines SET variance_reason_term = (SELECT json_extract(j.value, '$.r') FROM json_each(?) j WHERE json_extract(j.value, '$.id') = bar_stocktake_lines.id), updated_at = ?
          WHERE stocktake_id = ? AND id IN (SELECT json_extract(j.value, '$.id') FROM json_each(?) j)
          AND NOT EXISTS (SELECT 1 FROM json_each(?) j WHERE json_extract(j.value, '$.r') IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM core_terms t WHERE t.id = json_extract(j.value, '$.r') AND t.vocabulary_key = ? AND t.retired_at IS NULL))
          AND EXISTS (SELECT 1 FROM bar_stocktakes WHERE id = ? AND state = 'submitted')`,
    params: [json, nowMs(), stocktakeId, json, json, VARIANCE_REASONS, stocktakeId],
  }).expect(input.lines.length, { code: 'bar.stocktake.reason', reason: 'A line is not on this count, or a reason is not on the list.', remedy: 'Reload the count and pick reasons from the list.' })
}

/** Sends a submitted count back to be counted again. Each line keeps what was expected when it was counted, until it is counted again. */
export async function sendBack(unit: UnitView, stocktakeId: string): Promise<void> {
  const s = await row(stocktakeId)
  if (s.state !== 'submitted') refuse(not('submitted').code, not('submitted').reason, { status: 409, remedy: not('submitted').remedy })
  const at = nowMs()
  unit.add({ sql: 'UPDATE bar_stocktakes SET state = \'counting\', submitted_by = NULL, submitted_at = NULL, variance_value_minor = NULL, updated_at = ? WHERE id = ? AND state = \'submitted\'', params: [at, stocktakeId] }).expect(1, not('submitted'))
  unit.audit({ action: 'update', record: ['bar.stocktake', stocktakeId], detail: { state: 'counting' } })
}

/**
 * Whether this person may approve a submitted count of their own, and the values the screen needs to
 * say so: the person who submitted may approve only when the value of the difference is at most
 * bar.stocktake.self-approve-under; a line whose difference is worth more than
 * bar.stocktake.reason-over needs a reason first.
 */
export async function approval(stocktakeId: string, accountId: string | null): Promise<{ ownCount: boolean, selfApproveUnderMinor: number, reasonOverMinor: number }> {
  const s = await row(stocktakeId)
  const selfApproveUnderMinor = await useSetting('bar.stocktake.self-approve-under') as number
  return {
    ownCount: s.state === 'submitted' && !!accountId && s.submitted_by === accountId && Math.abs(s.variance_value_minor ?? 0) > selfApproveUnderMinor,
    selfApproveUnderMinor,
    reasonOverMinor: await useSetting('bar.stocktake.reason-over') as number,
  }
}

/**
 * Approves a submitted count: an adjustment per line that differs, the counted date on every line's
 * level, in one batch. The person who submitted may approve only a small difference, and every line
 * whose difference is worth more than bar.stocktake.reason-over must have a reason.
 */
export async function approveStocktake(unit: UnitView, stocktakeId: string, by: string): Promise<{ changed: number }> {
  const s = await row(stocktakeId)
  if (s.state !== 'submitted') refuse(not('submitted').code, not('submitted').reason, { status: 409, remedy: not('submitted').remedy })
  const limit = await useSetting('bar.stocktake.self-approve-under') as number
  if (s.submitted_by === by && Math.abs(s.variance_value_minor ?? 0) > limit)
    refuse('bar.stocktake.own-count', 'You submitted this count, and its difference is too large to approve yourself.', { status: 403, remedy: 'Ask someone else who can approve counts.' })
  const lines = await all<{ id: string, stock_item_id: string, counted: number, expected: number, reason: string | null, cost_minor: number | null, pack_size: number }>(
    `SELECT l.id, l.stock_item_id, l.counted, l.expected, l.variance_reason_term AS reason, i.cost_minor, i.pack_size
       FROM bar_stocktake_lines l JOIN bar_stock_items i ON i.id = l.stock_item_id WHERE l.stocktake_id = ? AND l.counted <> l.expected ORDER BY l.id`, stocktakeId,
  )
  const reasonOver = await useSetting('bar.stocktake.reason-over') as number
  const unexplained = lines.filter(l => !l.reason && Math.abs(valueOf(l.counted - l.expected, l.cost_minor, l.pack_size)) > reasonOver).length
  if (unexplained)
    refuse('bar.stocktake.reason-needed', `${unexplained} of the differences are too large to approve without a reason.`, { status: 422, remedy: 'Give each large difference a reason, then approve.' })
  const limitRows = await useSetting('core.units.set-rows-limit') as number
  if (lines.length > limitRows) refuse('bar.stocktake.too-many', `At most ${limitRows} levels change in one go.`, { status: 422, remedy: 'Count by category.' })
  const at = nowMs()
  unit.add({
    sql: `UPDATE bar_stocktakes SET state = 'approved', approved_by = ?, approved_at = ?, updated_at = ?
          WHERE id = ? AND state = 'submitted' AND updated_at = ? AND (submitted_by <> ? OR abs(coalesce(variance_value_minor, 0)) <= ?) -- exact-account: repeats the check above on the submitter just read`,
    params: [by, at, at, stocktakeId, s.updated_at, by, limit],
  }).expect(1, { code: 'bar.stocktake.changed', reason: 'This count changed while you were approving it.', remedy: 'Reload it and check it again.' })
  writeMovements(unit, lines.map(l => ({
    itemId: l.stock_item_id, locationId: s.location_id, kind: 'adjustment' as const, quantity: l.counted - l.expected,
    sourceType: 'bar.stocktake-line', sourceId: l.id, key: `bar:stocktake-line:${l.id}`, by,
  })), at)
  // Every item counted gets its counted date, whether or not it moved.
  unit.add({
    sql: `INSERT OR IGNORE INTO bar_stock_levels (stock_item_id, location_id, quantity, last_counted_at)
          SELECT stock_item_id, ?, 0, NULL FROM bar_stocktake_lines WHERE stocktake_id = ?`,
    params: [s.location_id, stocktakeId],
  })
  unit.add({
    sql: 'UPDATE bar_stock_levels SET last_counted_at = ? WHERE location_id = ? AND stock_item_id IN (SELECT stock_item_id FROM bar_stocktake_lines WHERE stocktake_id = ?)',
    params: [at, s.location_id, stocktakeId],
  })
  unit.audit({ action: 'update', record: ['bar.stocktake', stocktakeId], detail: { state: 'approved', changed: lines.length } })
  unit.announce('bar.stocktake.approved', { stocktakeId, locationId: s.location_id }, { record: ['bar.stocktake', stocktakeId] })
  return { changed: lines.length }
}

/** Abandons a count that is counting or submitted: nothing moves. Someone may abandon their own; an approver any. */
export async function abandonStocktake(unit: UnitView, stocktakeId: string, by: string, approver: boolean): Promise<void> {
  const s = await row(stocktakeId)
  if (s.state !== 'counting' && s.state !== 'submitted') refuse(not('live').code, 'This stocktake is already finished.', { status: 409, remedy: not('live').remedy })
  if (!approver && s.started_by !== by) refuse('bar.stocktake.not-yours', 'Only the person who started this count, or someone who approves counts, can abandon it.', { status: 403 })
  unit.add({ sql: 'UPDATE bar_stocktakes SET state = \'abandoned\', updated_at = ? WHERE id = ? AND state IN (\'counting\', \'submitted\')', params: [nowMs(), stocktakeId] }).expect(1, not('live'))
  unit.audit({ action: 'update', record: ['bar.stocktake', stocktakeId], detail: { state: 'abandoned' } })
}
