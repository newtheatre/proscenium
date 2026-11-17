// Checklists (part 3, "Checklists"; FH-24, FH-25). A checklist is a named list of items for a moment
// of the night. A run is one use of it for one performance, made the first time anyone opens it;
// its items are the checklist's live items at that moment. Each item takes one entry, changeable
// while the run is open, and the run completes by one tap once every required item has one.
import { all, first, localDate, newId, nowMs, refuse, type UnitView } from '#kit'
import { sql } from 'drizzle-orm'
import { assertTerm, getPerformance } from '#modules/core'
import { checklistItems } from './db/schema'

export const EXCEPTION_REASONS = 'front-of-house.exception-reason'

export type Moment = 'pre-show' | 'post-show' | 'other'
export interface ChecklistItem { id: string, label: string, help: string | null, kind: 'tick' | 'reading', unit: string | null, required: boolean, sortOrder: number }
export interface Checklist { id: string, name: string, moment: Moment, venueId: string | null, dutyId: string | null, sortOrder: number, archivedAt: number | null, items: ChecklistItem[] }

interface ItemRow { id: string, checklist_id: string, label: string, help: string | null, kind: 'tick' | 'reading', unit: string | null, required: number, sort_order: number, archived_at: number | null, created_at: number }
const toItem = (r: ItemRow): ChecklistItem => ({ id: r.id, label: r.label, help: r.help, kind: r.kind, unit: r.unit, required: !!r.required, sortOrder: r.sort_order })

export async function listChecklists(options: { includeArchived?: boolean } = {}): Promise<Checklist[]> {
  const rows = await all<{ id: string, name: string, moment: Moment, venue_id: string | null, duty_id: string | null, sort_order: number, archived_at: number | null }>(
    `SELECT * FROM front_of_house_checklists ${options.includeArchived ? '' : 'WHERE archived_at IS NULL'} ORDER BY sort_order, name`)
  const items = await all<ItemRow>('SELECT * FROM front_of_house_checklist_items WHERE archived_at IS NULL ORDER BY sort_order, created_at')
  return rows.map(r => ({
    id: r.id, name: r.name, moment: r.moment, venueId: r.venue_id, dutyId: r.duty_id, sortOrder: r.sort_order, archivedAt: r.archived_at,
    items: items.filter(i => i.checklist_id === r.id).map(toItem),
  }))
}

export async function getChecklist(id: string): Promise<Checklist | null> {
  return (await listChecklists({ includeArchived: true })).find(c => c.id === id) ?? null
}

export interface ItemInput { id?: string, label: string, help?: string | null, kind?: 'tick' | 'reading', unit?: string | null, required?: boolean }
export interface ChecklistInput { name: string, moment: Moment, venueId?: string | null, dutyId?: string | null, sortOrder?: number, items: ItemInput[] }

/**
 * Writes the items in the order given. An item with an id is changed in place; one without is new;
 * a live item left out is archived, never deleted, so runs that used it keep their entries.
 */
function writeItems(unit: UnitView, checklistId: string, items: ItemInput[], known: Set<string>, at: number): void {
  const kept = items.filter(i => i.id).map(i => i.id!)
  for (const id of kept) if (!known.has(id)) refuse('front-of-house.item-unknown', 'One of these items is not on this checklist.', { status: 422 })
  unit.add({
    sql: 'UPDATE front_of_house_checklist_items SET archived_at = ?, updated_at = ? WHERE checklist_id = ? AND archived_at IS NULL AND id NOT IN (SELECT value FROM json_each(?))',
    params: [at, at, checklistId, JSON.stringify(kept)],
  })
  items.forEach((item, sortOrder) => {
    if (!item.id) return
    unit.add({
      sql: 'UPDATE front_of_house_checklist_items SET label = ?, help = ?, kind = ?, unit = ?, required = ?, sort_order = ?, updated_at = ? WHERE id = ? AND checklist_id = ?',
      params: [item.label, item.help ?? null, item.kind ?? 'tick', item.kind === 'reading' ? item.unit ?? null : null, item.required === false ? 0 : 1, sortOrder, at, item.id, checklistId],
    })
  })
  const fresh = items.map((item, sortOrder) => ({ item, sortOrder })).filter(x => !x.item.id)
  if (fresh.length) {
    unit.insertSet(checklistItems, fresh.map(({ item, sortOrder }) => ({
      checklistId,
      label: item.label,
      help: item.help ?? null,
      kind: item.kind ?? 'tick',
      unit: item.kind === 'reading' ? item.unit ?? null : null,
      required: item.required !== false,
      sortOrder,
    })))
  }
}

export function createChecklist(unit: UnitView, input: ChecklistInput): string {
  const id = newId('ckl')
  const at = nowMs()
  unit.add({
    sql: 'INSERT INTO front_of_house_checklists (id, name, moment, venue_id, duty_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    params: [id, input.name, input.moment, input.venueId ?? null, input.dutyId ?? null, input.sortOrder ?? 0, at, at],
  })
  writeItems(unit, id, input.items, new Set(), at)
  unit.audit({ action: 'create', detail: { checklist: id, items: input.items.length } })
  return id
}

export async function updateChecklist(unit: UnitView, id: string, input: ChecklistInput): Promise<void> {
  const existing = await getChecklist(id)
  if (!existing || existing.archivedAt !== null) refuse('core.not-found', 'There is no such checklist, or it is archived.', { status: 404 })
  const at = nowMs()
  unit.add({
    sql: 'UPDATE front_of_house_checklists SET name = ?, moment = ?, venue_id = ?, duty_id = ?, sort_order = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL',
    params: [input.name, input.moment, input.venueId ?? null, input.dutyId ?? null, input.sortOrder ?? existing.sortOrder, at, id],
  }).expect(1, { code: 'core.not-found', reason: 'There is no such checklist, or it is archived.' })
  writeItems(unit, id, input.items, new Set(existing.items.map(i => i.id)), at)
  unit.audit({ action: 'update', detail: { checklist: id, items: input.items.length } })
}

export function archiveChecklist(unit: UnitView, id: string): void {
  const at = nowMs()
  unit.add({ sql: 'UPDATE front_of_house_checklists SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL', params: [at, at, id] })
    .expect(1, { code: 'core.not-found', reason: 'There is no such checklist, or it is already archived.' })
  unit.audit({ action: 'archive', detail: { checklist: id } })
}

// ---------------------------------------------------------------------------------------------
// Runs

/** The items a run covers: those live on the checklist when the run was made. */
const RUN_ITEMS = 'i.checklist_id = r.checklist_id AND i.created_at <= r.created_at AND (i.archived_at IS NULL OR i.archived_at > r.created_at)'

export interface RunProgress {
  checklistId: string
  name: string
  moment: Moment
  dutyId: string | null
  runId: string | null
  state: 'not_started' | 'open' | 'complete' | 'complete_with_exceptions'
  entered: number
  required: number
  exceptions: number
}

/** Each checklist that applies at a performance's venue, with its run's progress (the board). */
export async function runsFor(performanceId: string, venueId: string): Promise<RunProgress[]> {
  const lists = await all<{ id: string, name: string, moment: Moment, duty_id: string | null, run_id: string | null, state: RunProgress['state'] | null, live: number }>(
    `SELECT c.id, c.name, c.moment, c.duty_id, r.id AS run_id, r.state,
      (SELECT count(*) FROM front_of_house_checklist_items i WHERE i.checklist_id = c.id AND i.archived_at IS NULL AND i.required = 1) AS live
     FROM front_of_house_checklists c
     LEFT JOIN front_of_house_checklist_runs r ON r.checklist_id = c.id AND r.performance_id = ?
     WHERE (c.archived_at IS NULL OR r.id IS NOT NULL) AND (c.venue_id IS NULL OR c.venue_id = ?)
     ORDER BY CASE c.moment WHEN 'pre-show' THEN 0 WHEN 'post-show' THEN 2 ELSE 1 END, c.sort_order, c.name`, performanceId, venueId)
  const counts = await all<{ run_id: string, entered: number, required: number, exceptions: number }>(
    `SELECT r.id AS run_id,
      (SELECT count(*) FROM front_of_house_checklist_entries e WHERE e.run_id = r.id) AS entered,
      (SELECT count(*) FROM front_of_house_checklist_items i WHERE ${RUN_ITEMS} AND i.required = 1) AS required,
      (SELECT count(*) FROM front_of_house_checklist_entries e WHERE e.run_id = r.id AND e.outcome = 'exception') AS exceptions
     FROM front_of_house_checklist_runs r WHERE r.performance_id = ?`, performanceId)
  return lists.map((l) => {
    const c = counts.find(x => x.run_id === l.run_id)
    return {
      checklistId: l.id, name: l.name, moment: l.moment, dutyId: l.duty_id, runId: l.run_id, state: l.state ?? 'not_started',
      entered: c?.entered ?? 0, required: c?.required ?? l.live, exceptions: c?.exceptions ?? 0,
    }
  })
}

/** Makes the run for a checklist and performance if there is none yet. Safe to repeat. */
function ensureRun(unit: UnitView, checklistId: string, performanceId: string, venueId: string, day: string, at: number): void {
  unit.add({
    sql: `INSERT INTO front_of_house_checklist_runs (id, checklist_id, performance_id, venue_id, local_date, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'open', ?, ?) ON CONFLICT DO NOTHING`,
    params: [newId('ckr'), checklistId, performanceId, venueId, day, at, at],
  })
}

async function applying(checklistId: string, performanceId: string) {
  const performance = await getPerformance(performanceId)
  const checklist = await getChecklist(checklistId)
  if (!checklist) refuse('core.not-found', 'There is no such checklist.', { status: 404 })
  if (checklist.venueId && checklist.venueId !== performance.venueId) refuse('front-of-house.checklist-elsewhere', 'This checklist is for another venue.')
  return { performance, checklist }
}

export interface RunView {
  runId: string
  checklistId: string
  name: string
  moment: Moment
  state: 'open' | 'complete' | 'complete_with_exceptions'
  completedAt: number | null
  items: (ChecklistItem & { entry: { outcome: 'done' | 'exception' | 'not_applicable', reading: number | null, reasonCode: string | null, reasonNote: string | null, doneAt: number } | null })[]
}

/** Opens a checklist for a performance: makes its run the first time, then reads it. */
export async function openRun(unit: UnitView, checklistId: string, performanceId: string): Promise<void> {
  const { performance, checklist } = await applying(checklistId, performanceId)
  const existing = await first('SELECT 1 AS one FROM front_of_house_checklist_runs WHERE checklist_id = ? AND performance_id = ?', checklistId, performanceId)
  if (existing) return
  if (checklist.archivedAt !== null) refuse('core.not-found', 'This checklist is archived.', { status: 404 })
  ensureRun(unit, checklistId, performanceId, performance.venueId, await localDate(performance.startsAt), nowMs())
}

export async function readRun(checklistId: string, performanceId: string): Promise<RunView | null> {
  const run = await first<{ id: string, state: RunView['state'], completed_at: number | null, created_at: number }>(
    'SELECT id, state, completed_at, created_at FROM front_of_house_checklist_runs WHERE checklist_id = ? AND performance_id = ?', checklistId, performanceId)
  const checklist = await getChecklist(checklistId)
  if (!run || !checklist) return null
  const items = await all<ItemRow>(
    `SELECT i.* FROM front_of_house_checklist_items i JOIN front_of_house_checklist_runs r ON r.id = ? WHERE ${RUN_ITEMS} ORDER BY i.sort_order, i.created_at`, run.id)
  const entries = await all<{ item_id: string, outcome: 'done' | 'exception' | 'not_applicable', reading: number | null, reason_code: string | null, reason_note: string | null, done_at: number }>(
    'SELECT item_id, outcome, reading, reason_code, reason_note, done_at FROM front_of_house_checklist_entries WHERE run_id = ?', run.id)
  return {
    runId: run.id, checklistId, name: checklist.name, moment: checklist.moment, state: run.state, completedAt: run.completed_at,
    items: items.map((i) => {
      const e = entries.find(x => x.item_id === i.id)
      return { ...toItem(i), entry: e ? { outcome: e.outcome, reading: e.reading, reasonCode: e.reason_code, reasonNote: e.reason_note, doneAt: e.done_at } : null }
    }),
  }
}

export interface EntryInput {
  checklistId: string
  performanceId: string
  itemId: string
  outcome: 'done' | 'exception' | 'not_applicable'
  reading?: number | null
  reasonCode?: string | null
  reasonNote?: string | null
  by: string
  /** The device's time, when the entry was queued offline. */
  doneAt?: number
}

/**
 * Enters one item. Makes the run if no one has opened it yet; refused once the run is complete,
 * which is how a queued entry arriving late is shown as stuck. The last write wins per item.
 */
export async function enterItem(unit: UnitView, input: EntryInput): Promise<void> {
  const { performance } = await applying(input.checklistId, input.performanceId)
  const item = await first<ItemRow>('SELECT * FROM front_of_house_checklist_items WHERE id = ? AND checklist_id = ?', input.itemId, input.checklistId)
  if (!item) refuse('core.not-found', 'There is no such item on this checklist.', { status: 404 })
  if (input.outcome === 'done' && item.kind === 'reading' && (input.reading === null || input.reading === undefined))
    refuse('front-of-house.reading-needed', 'This item needs its reading.', { status: 422, fields: { reading: 'Enter the reading.' } })
  if (input.outcome === 'exception' && !input.reasonCode)
    refuse('front-of-house.reason-needed', 'Say why this could not be done.', { status: 422, fields: { reasonCode: 'Choose a reason.' } })
  const at = nowMs()
  const doneAt = input.doneAt ?? at
  ensureRun(unit, input.checklistId, input.performanceId, performance.venueId, await localDate(performance.startsAt), at)
  const reason = input.outcome === 'exception' ? input.reasonCode! : null
  const known = reason ? assertTerm(reason, EXCEPTION_REASONS) : sql`1`
  unit.add(sql`INSERT INTO front_of_house_checklist_entries (id, run_id, item_id, label, outcome, reading, reason_code, reason_note, done_by, done_at, created_at, updated_at)
    SELECT ${newId('cke')}, r.id, ${item.id}, ${item.label}, ${input.outcome}, ${item.kind === 'reading' ? input.reading ?? null : null}, ${reason}, ${input.reasonNote ?? null}, ${input.by}, ${doneAt}, ${at}, ${at}
      FROM front_of_house_checklist_runs r WHERE r.checklist_id = ${input.checklistId} AND r.performance_id = ${input.performanceId} AND r.state = 'open' AND ${known}
    ON CONFLICT (run_id, item_id) DO UPDATE SET outcome = excluded.outcome, reading = excluded.reading, reason_code = excluded.reason_code,
      reason_note = excluded.reason_note, done_by = excluded.done_by, done_at = excluded.done_at, updated_at = excluded.updated_at`)
    .expect(1, reason
      ? { code: 'front-of-house.checklist-run-complete', reason: 'This checklist is already complete, or that reason is not one of the theatre\'s.', remedy: 'Ask someone leading to reopen it if something has changed.' }
      : { code: 'front-of-house.checklist-run-complete', reason: 'This checklist is already complete.', remedy: 'Ask someone leading to reopen it if something has changed.' })
  unit.audit({ action: 'update', record: ['core.performance', input.performanceId], detail: { checklist: input.checklistId, item: item.id, outcome: input.outcome } })
}

/** Completes a run once every required item has an entry: with exceptions when any entry is one. */
export async function completeRun(unit: UnitView, input: { checklistId: string, performanceId: string, by: string }): Promise<{ state: 'complete' | 'complete_with_exceptions' }> {
  const run = await first<{ id: string }>('SELECT id FROM front_of_house_checklist_runs WHERE checklist_id = ? AND performance_id = ?', input.checklistId, input.performanceId)
  if (!run) refuse('front-of-house.checklist-incomplete', 'Nothing on this checklist has been entered yet.')
  const exceptions = await first<{ n: number }>('SELECT count(*) AS n FROM front_of_house_checklist_entries WHERE run_id = ? AND outcome = \'exception\'', run.id)
  const state = exceptions!.n > 0 ? 'complete_with_exceptions' as const : 'complete' as const
  const at = nowMs()
  unit.add({
    sql: `UPDATE front_of_house_checklist_runs AS r SET state = ?, completed_by = ?, completed_at = ?, updated_at = ?
      WHERE r.id = ? AND r.state = 'open'
        AND NOT EXISTS (SELECT 1 FROM front_of_house_checklist_items i WHERE ${RUN_ITEMS} AND i.required = 1
          AND NOT EXISTS (SELECT 1 FROM front_of_house_checklist_entries e WHERE e.run_id = r.id AND e.item_id = i.id))`,
    params: [state, input.by, at, at, run.id],
  }).expect(1, { code: 'front-of-house.checklist-incomplete', reason: 'Every required item needs an entry first, or the checklist is already complete.', remedy: 'Mark anything that could not be done as an exception.' })
  unit.announce('front-of-house.checklist-run.completed', { runId: run.id, checklistId: input.checklistId, performanceId: input.performanceId }, { record: ['front-of-house.checklist-run', run.id] })
  unit.audit({ action: 'state', record: ['front-of-house.checklist-run', run.id], detail: { to: state } })
  return { state }
}

/** Reopens a completed run, for someone leading, before the night report is signed off. */
export async function reopenRun(unit: UnitView, input: { checklistId: string, performanceId: string }): Promise<void> {
  const run = await first<{ id: string, state: string }>('SELECT id, state FROM front_of_house_checklist_runs WHERE checklist_id = ? AND performance_id = ?', input.checklistId, input.performanceId)
  if (!run) refuse('core.not-found', 'This checklist has not been started.', { status: 404 })
  const at = nowMs()
  // The night report arrives in a later part of the build; its sign-off will add the second condition.
  unit.add({ sql: 'UPDATE front_of_house_checklist_runs SET state = \'open\', completed_by = NULL, completed_at = NULL, updated_at = ? WHERE id = ? AND state <> \'open\'', params: [at, run.id] })
    .expect(1, { code: 'front-of-house.checklist-open', reason: 'This checklist is not complete.' })
  unit.audit({ action: 'state', record: ['front-of-house.checklist-run', run.id], detail: { from: run.state, to: 'open' } })
}
