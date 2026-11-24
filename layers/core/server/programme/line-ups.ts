// A performance's line-up (C-61; festival-ready changes, LU1 to LU6): the acts in order, each with a
// production of its own or just a name, an optional set time inside the performance and a length.
// Every rule is a predicate on its statement; a read beforehand only chooses the words of a refusal.
import { sql, type SQL } from 'drizzle-orm'
import { all, first, newId, refuse } from '#kit'
import type { UnitView } from '#kit'

export interface LineUpItem {
  id: string
  performanceId: string
  productionId: string | null
  name: string
  note: string | null
  startsAt: number | null
  minutes: number | null
  announced: boolean
  /** The linked production, where there is one (and, read publicOnly, where it is published). */
  production: { id: string, slug: string, title: string } | null
}

export interface LineUpInput {
  productionId?: string | null
  /** As printed. Taken from the linked production's title when not given. */
  name?: string
  note?: string | null
  startsAt?: number | null
  minutes?: number | null
  announced?: boolean
  /** The item it follows; null puts it first; left out, it goes last. */
  after?: string | null
}

interface ItemRow { id: string, performance_id: string, production_id: string | null, name: string, note: string | null, starts_at: number | null, minutes: number | null, announced: number, sort: number, slug: string | null, title: string | null, state: string | null }

const CHANGED = { code: 'core.line-up.changed', reason: 'The line-up changed while you were working.', remedy: 'Refresh and try again.' }
const OUTSIDE = { code: 'core.line-up.time-outside', reason: 'A set time is within the performance, from its start to its end.' }
const ALREADY = { code: 'core.line-up.already-in', reason: 'That production is already in this line-up.' }
const NAME_MAX = 120 // not-policy: the column's bound
const record = (performanceId: string): ['core.performance', string] => ['core.performance', performanceId]

/** Each performance's items, in order. publicOnly leaves out items not yet announced and unpublished productions' links. */
export async function lineUpsFor(performanceIds: readonly string[], options: { publicOnly?: boolean } = {}): Promise<Map<string, LineUpItem[]>> {
  const out = new Map<string, LineUpItem[]>(performanceIds.map(id => [id, []]))
  if (!performanceIds.length) return out
  const rows = await all<ItemRow>(`SELECT l.*, p.slug, p.title, p.state FROM core_performance_line_ups l LEFT JOIN core_productions p ON p.id = l.production_id
    WHERE l.performance_id IN (SELECT value FROM json_each(?))${options.publicOnly ? ' AND l.announced = 1' : ''} ORDER BY l.performance_id, l.sort, l.id`, JSON.stringify([...new Set(performanceIds)]))
  for (const r of rows) {
    const linked = r.production_id && r.slug && (!options.publicOnly || r.state === 'published')
    out.get(r.performance_id)?.push({
      id: r.id, performanceId: r.performance_id, productionId: options.publicOnly && !linked ? null : r.production_id, name: r.name, note: r.note,
      startsAt: r.starts_at, minutes: r.minutes, announced: !!r.announced,
      production: linked ? { id: r.production_id!, slug: r.slug!, title: r.title! } : null,
    })
  }
  return out
}

/** LU1: no set time, or one from the performance's start up to its end. */
const timeFits = (performanceId: string, startsAt: number | SQL | null): SQL =>
  sql`EXISTS (SELECT 1 FROM core_performances f WHERE f.id = ${performanceId} AND (${startsAt} IS NULL OR (${startsAt} >= f.starts_at AND ${startsAt} < f.ends_at)))`

/** LU2: the production is not already in this line-up, other than as `except`. */
const notAlreadyIn = (performanceId: string, productionId: string | null, except: string | null = null): SQL =>
  sql`(${productionId} IS NULL OR NOT EXISTS (SELECT 1 FROM core_performance_line_ups o WHERE o.performance_id = ${performanceId} AND o.production_id = ${productionId} AND o.id IS NOT ${except}))`

async function refusalFor(performanceId: string, productionId: string | null, startsAt: number | null, except: string | null = null) {
  const f = await first<{ starts_at: number, ends_at: number }>('SELECT starts_at, ends_at FROM core_performances WHERE id = ?', performanceId)
  if (!f) refuse('core.performance.not-found', 'There is no such performance.', { status: 404 })
  if (startsAt !== null && (startsAt < f.starts_at || startsAt >= f.ends_at)) return OUTSIDE
  if (productionId && await first('SELECT 1 FROM core_performance_line_ups WHERE performance_id = ? AND production_id = ? AND id IS NOT ?', performanceId, productionId, except)) return ALREADY
  return CHANGED
}

/** Makes room after `after` (first when null) and answers the new item's sort, as SQL read in the same batch. */
function placeAfter(unit: UnitView, performanceId: string, after: string | null | undefined, moving: string | null = null): SQL {
  if (after === undefined) return sql`(SELECT coalesce(max(sort), -1) + 1 FROM core_performance_line_ups WHERE performance_id = ${performanceId} AND id IS NOT ${moving})`
  if (after === null) {
    unit.add(sql`UPDATE core_performance_line_ups SET sort = sort + 1 WHERE performance_id = ${performanceId}`)
    return sql`0`
  }
  unit.add(sql`UPDATE core_performance_line_ups SET sort = sort + 1 WHERE performance_id = ${performanceId}
    AND sort > (SELECT sort FROM core_performance_line_ups WHERE id = ${after} AND performance_id = ${performanceId})`)
  return sql`(SELECT sort + 1 FROM core_performance_line_ups WHERE id = ${after} AND performance_id = ${performanceId})`
}

/** Adds an item, linked to a production or by name. Returns its id. */
export async function addLineUpItem(unit: UnitView, performanceId: string, input: LineUpInput): Promise<string> {
  const productionId = input.productionId ?? null
  let name = input.name?.trim()
  if (!name && productionId) name = (await first<{ title: string }>('SELECT title FROM core_productions WHERE id = ?', productionId))?.title
  if (!name) refuse('core.line-up.name-needed', 'Give the act a name, or choose its production.', { status: 422, fields: { name: 'Give a name.' } })
  if (input.after && !await first('SELECT 1 FROM core_performance_line_ups WHERE id = ? AND performance_id = ?', input.after, performanceId)) refuse(CHANGED.code, CHANGED.reason, { status: 409, remedy: CHANGED.remedy })
  const startsAt = input.startsAt ?? null
  const refusal = await refusalFor(performanceId, productionId, startsAt)
  const id = newId('lup')
  const sort = placeAfter(unit, performanceId, input.after)
  unit.add(sql`INSERT INTO core_performance_line_ups (id, performance_id, production_id, name, note, starts_at, minutes, announced, sort, created_at, updated_at)
    SELECT ${id}, ${performanceId}, ${productionId}, ${name.slice(0, NAME_MAX)}, ${input.note ?? null}, ${startsAt}, ${input.minutes ?? null}, ${input.announced === false ? 0 : 1}, ${sort}, ${Date.now()}, ${Date.now()}
    WHERE ${timeFits(performanceId, startsAt)} AND ${notAlreadyIn(performanceId, productionId)}
      AND (${productionId} IS NULL OR EXISTS (SELECT 1 FROM core_productions WHERE id = ${productionId}))`).expect(1, refusal)
  unit.audit({ action: 'update', record: record(performanceId), detail: { lineUp: 'added', item: id } })
  unit.announce('core.line-up.changed', { performanceId }, { record: record(performanceId) })
  return id
}

/** Refuses an item that is not in this performance's line-up, as one that does not exist. */
export async function assertLineUpItemIn(performanceId: string, itemId: string): Promise<void> {
  if (!await first('SELECT 1 FROM core_performance_line_ups WHERE id = ? AND performance_id = ?', itemId, performanceId)) refuse('core.not-found', 'There is no such line-up item.', { status: 404 })
}

async function itemRow(itemId: string): Promise<ItemRow> {
  const row = await first<ItemRow>('SELECT l.*, NULL AS slug, NULL AS title, NULL AS state FROM core_performance_line_ups l WHERE l.id = ?', itemId)
  if (!row) refuse('core.not-found', 'There is no such line-up item.', { status: 404 })
  return row
}

/** Changes an item's name, note, set time, length or whether it is announced. */
export async function updateLineUpItem(unit: UnitView, itemId: string, patch: Omit<LineUpInput, 'after' | 'productionId'>): Promise<void> {
  const row = await itemRow(itemId)
  const startsAt = patch.startsAt === undefined ? row.starts_at : patch.startsAt
  const refusal = await refusalFor(row.performance_id, null, startsAt, itemId)
  unit.add(sql`UPDATE core_performance_line_ups SET name = ${patch.name?.trim() || row.name}, note = ${patch.note === undefined ? row.note : patch.note},
      starts_at = ${startsAt}, minutes = ${patch.minutes === undefined ? row.minutes : patch.minutes}, announced = ${patch.announced === undefined ? row.announced : patch.announced ? 1 : 0}, updated_at = ${Date.now()}
    WHERE id = ${itemId} AND ${timeFits(row.performance_id, startsAt)}`).expect(1, refusal)
  unit.audit({ action: 'update', record: record(row.performance_id), detail: { lineUp: 'changed', item: itemId } })
  unit.announce('core.line-up.changed', { performanceId: row.performance_id }, { record: record(row.performance_id) })
}

/** Moves an item to follow `after`, or first when after is null. */
export async function moveLineUpItem(unit: UnitView, itemId: string, input: { after: string | null }): Promise<void> {
  const row = await itemRow(itemId)
  if (input.after === itemId) return
  if (input.after && !await first('SELECT 1 FROM core_performance_line_ups WHERE id = ? AND performance_id = ?', input.after, row.performance_id)) refuse(CHANGED.code, CHANGED.reason, { status: 409, remedy: CHANGED.remedy })
  // Out of the way first, so making room after `after` never counts the item itself.
  unit.add(sql`UPDATE core_performance_line_ups SET sort = -1 WHERE id = ${itemId}`).expect(1, CHANGED)
  unit.add(sql`UPDATE core_performance_line_ups SET sort = sort - 1 WHERE performance_id = ${row.performance_id} AND sort > ${row.sort}`)
  const sort = placeAfter(unit, row.performance_id, input.after, itemId)
  unit.add(sql`UPDATE core_performance_line_ups SET sort = ${sort}, updated_at = ${Date.now()} WHERE id = ${itemId}`).expect(1, CHANGED)
  unit.audit({ action: 'update', record: record(row.performance_id), detail: { lineUp: 'moved', item: itemId } })
  unit.announce('core.line-up.changed', { performanceId: row.performance_id }, { record: record(row.performance_id) })
}

/** Removes an item. Its line-up credits go with it. */
export async function removeLineUpItem(unit: UnitView, itemId: string): Promise<void> {
  const row = await itemRow(itemId)
  unit.add(sql`DELETE FROM core_production_credits WHERE line_up_id = ${itemId}`)
  unit.add(sql`DELETE FROM core_performance_line_ups WHERE id = ${itemId}`).expect(1, CHANGED)
  unit.add(sql`UPDATE core_performance_line_ups SET sort = sort - 1 WHERE performance_id = ${row.performance_id} AND sort > ${row.sort}`)
  unit.audit({ action: 'update', record: record(row.performance_id), detail: { lineUp: 'removed', item: itemId } })
  unit.announce('core.line-up.changed', { performanceId: row.performance_id }, { record: record(row.performance_id) })
}

/** LU1: moving a performance moves every set time by the same amount, in the mover's unit. */
export function shiftLineUp(unit: UnitView, performanceId: string, by: number): void {
  if (by) unit.add(sql`UPDATE core_performance_line_ups SET starts_at = starts_at + ${by} WHERE performance_id = ${performanceId} AND starts_at IS NOT NULL`)
}

/** LU3: where a production appears in other performances' announced line-ups, for its public page. */
export async function appearancesOf(productionId: string): Promise<{ performanceId: string, productionId: string, slug: string, title: string, startsAt: number }[]> {
  return all(`SELECT f.id AS performanceId, p.id AS productionId, p.slug, p.title, coalesce(l.starts_at, f.starts_at) AS startsAt
    FROM core_performance_line_ups l JOIN core_performances f ON f.id = l.performance_id JOIN core_productions p ON p.id = f.production_id
    WHERE l.production_id = ? AND l.announced = 1 AND f.state = 'scheduled' AND p.state = 'published' AND p.id <> ?
    ORDER BY startsAt, f.id`, productionId, productionId)
}
