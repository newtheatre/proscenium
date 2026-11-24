// The door counter (BO-73): people counted in and out with presses, beside the tickets scanned. A
// press's id is made on the device, so one sent twice, or sent again after coming back online, counts
// once (HC2). A full house never refuses a press, because the people are already there (HC4). A
// press is undone from the device within the undo window; later, by a supervisor with a reason (HC5).
import { all, can, createUnit, first, nowMs, refuse, useContext, useSetting, type UnitView } from '#kit'
import { capacityOf, getTerm } from '#modules/core'
import { tally, type Tap, type Tally } from '../shared/headcount'

/** The vocabulary a supervisor picks the reason for a late correction from. */
export const CORRECTION_REASONS = 'box-office.headcount-correction'

export interface Headcount extends Tally {
  /** Tickets scanned in at the door: shown beside the counter, never added to it. */
  admitted: number
  /** People counted in with the counter, which for a timed performance are its walk-ups. */
  walkUps: number
  capacity: number | null
}

interface TapRow { id: string, performance_id: string, kind: Tap['kind'], quantity: number, reverses_id: string | null, tapped_at: number }

const asTap = (r: TapRow): Tap => ({ id: r.id, kind: r.kind, quantity: Number(r.quantity), reversesId: r.reverses_id, tappedAt: Number(r.tapped_at) })

async function tapsOf(performanceIds: string[]): Promise<Map<string, Tap[]>> {
  const rows = await all<TapRow>('SELECT id, performance_id, kind, quantity, reverses_id, tapped_at FROM box_office_headcount_taps WHERE performance_id IN (SELECT value FROM json_each(?))', JSON.stringify(performanceIds))
  const by = new Map<string, Tap[]>(performanceIds.map(id => [id, []]))
  for (const row of rows) by.get(row.performance_id)?.push(asTap(row))
  return by
}

/** The door's figures for each performance, asked for as a set. */
export async function headcountFor(performanceIds: string[]): Promise<Record<string, Headcount>> {
  const ids = [...new Set(performanceIds)]
  if (!ids.length) return {}
  const taps = await tapsOf(ids)
  const admitted = await all<{ performance_id: string, n: number }>(
    'SELECT performance_id, count(*) AS n FROM box_office_tickets WHERE performance_id IN (SELECT value FROM json_each(?)) AND state = \'valid\' AND admitted_at IS NOT NULL GROUP BY performance_id', JSON.stringify(ids))
  const out: Record<string, Headcount> = {}
  for (const id of ids) {
    const counted = tally(taps.get(id) ?? [])
    out[id] = { ...counted, walkUps: counted.in, admitted: Number(admitted.find(a => a.performance_id === id)?.n ?? 0), capacity: await capacityOf(id) }
  }
  return out
}

/** Whether the counter offers Out: for drop-in performances, or everywhere once the setting is on (HC3). */
export async function countsOut(_performanceId: string): Promise<boolean> {
  return !!(await useSetting('box-office.door.count-out'))
}

export type TapItem
  = | { kind: 'in' | 'out', id: string, quantity: number, at: number }
    | { kind: 'undo', id: string, reversesId: string, at: number }

export type TapResult = 'counted' | 'sent' | 'out-not-offered' | 'not-found' | 'not-undoable' | 'already-undone' | 'too-late'

/** What a supervisor's correction or a device's undo would reverse, or why it cannot. */
async function undoable(performanceId: string, reversesId: string, pending: Set<string>): Promise<{ tap: TapRow } | { problem: Exclude<TapResult, 'counted' | 'sent' | 'out-not-offered' | 'too-late'> }> {
  const tap = await first<TapRow>('SELECT id, performance_id, kind, quantity, reverses_id, tapped_at FROM box_office_headcount_taps WHERE id = ? AND performance_id = ?', reversesId, performanceId)
  if (!tap) return { problem: 'not-found' }
  if (tap.kind === 'undo') return { problem: 'not-undoable' }
  if (pending.has(tap.id) || await first('SELECT 1 AS one FROM box_office_headcount_taps WHERE reverses_id = ?', tap.id)) return { problem: 'already-undone' }
  return { tap }
}

function insert(unit: UnitView, performanceId: string, row: { id: string, kind: Tap['kind'], quantity: number, reversesId: string | null, reasonTermId?: string | null, deviceLabel: string | null, at: number, offline: boolean }): void {
  // Ignored when the id is already stored: the same press sent again (HC2).
  unit.add({
    sql: `INSERT OR IGNORE INTO box_office_headcount_taps (id, performance_id, kind, quantity, reverses_id, reason_term_id, tapped_by, device_label, tapped_at, received_at, offline)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [row.id, performanceId, row.kind, row.quantity, row.reversesId, row.reasonTermId ?? null, useContext().actor.accountId, row.deviceLabel, row.at, nowMs(), row.offline ? 1 : 0],
  })
}

/** Announces a full house the first time the people inside reach capacity. */
function announceFull(unit: UnitView, full: { performanceId: string, before: Tally, after: Tally, capacity: number | null }): void {
  const { performanceId, before, after, capacity } = full
  if (capacity && before.peak < capacity && after.inside >= capacity)
    unit.announce('box-office.headcount.full', { performanceId, inside: after.inside, capacity }, { record: ['core.performance', performanceId] })
}

interface Taking {
  unit: ReturnType<typeof createUnit>
  performanceId: string
  options: { deviceLabel: string | null, offline: boolean }
  window: number
  outOffered: boolean
  added: Tap[]
  undoing: Set<string>
}

async function takeUndo(taking: Taking, item: Extract<TapItem, { kind: 'undo' }>): Promise<TapResult> {
  const { performanceId, added, undoing } = taking
  const fresh = added.find(t => t.id === item.reversesId)
  const found = fresh
    ? (undoing.has(fresh.id) ? { problem: 'already-undone' as const } : { tap: { id: fresh.id, performance_id: performanceId, kind: fresh.kind, quantity: fresh.quantity, reverses_id: null, tapped_at: fresh.tappedAt } })
    : await undoable(performanceId, item.reversesId, undoing)
  if ('problem' in found) return found.problem
  if (item.at - Number(found.tap.tapped_at) > taking.window) return 'too-late'
  undoing.add(found.tap.id)
  const quantity = Number(found.tap.quantity)
  insert(taking.unit.view(), performanceId, { id: item.id, kind: 'undo', quantity, reversesId: found.tap.id, deviceLabel: taking.options.deviceLabel, at: item.at, offline: taking.options.offline })
  added.push({ id: item.id, kind: 'undo', quantity, reversesId: found.tap.id, tappedAt: item.at })
  return 'counted'
}

function takePress(taking: Taking, item: Exclude<TapItem, { kind: 'undo' }>): TapResult {
  if (item.kind === 'out' && !taking.outOffered) return 'out-not-offered'
  insert(taking.unit.view(), taking.performanceId, { id: item.id, kind: item.kind, quantity: item.quantity, reversesId: null, deviceLabel: taking.options.deviceLabel, at: item.at, offline: taking.options.offline })
  taking.added.push({ id: item.id, kind: item.kind, quantity: item.quantity, reversesId: null, tappedAt: item.at })
  return 'counted'
}

/**
 * Takes a device's presses, oldest first: one at a time online, or a batch saved while offline. An
 * undo reverses a press within the undo window, measured by the device's clock.
 */
export async function takeTaps(performanceId: string, items: TapItem[], options: { deviceLabel: string | null, offline: boolean }): Promise<{ results: { id: string, result: TapResult }[], headcount: Headcount }> {
  const window = (await useSetting('box-office.door.undo-within') as number) * 1000 // not-policy: seconds to milliseconds
  const seen = new Set((await all<{ id: string }>('SELECT id FROM box_office_headcount_taps WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(items.map(i => i.id)))).map(r => r.id))
  const capacity = await capacityOf(performanceId)
  const existing = (await tapsOf([performanceId])).get(performanceId) ?? []
  const taking: Taking = { unit: createUnit(), performanceId, options, window, outOffered: await countsOut(performanceId), added: [], undoing: new Set() }
  const results: { id: string, result: TapResult }[] = []
  for (const item of [...items].sort((a, b) => a.at - b.at)) {
    const repeated = seen.has(item.id)
    seen.add(item.id)
    const result = repeated ? 'sent' : item.kind === 'undo' ? await takeUndo(taking, item) : takePress(taking, item)
    results.push({ id: item.id, result })
  }
  announceFull(taking.unit.view(), { performanceId, before: tally(existing), after: tally([...existing, ...taking.added]), capacity })
  await taking.unit.commit()
  return { results, headcount: (await headcountFor([performanceId]))[performanceId]! }
}

/** A supervisor's undo of a press outside the undo window, with a reason from the theatre's list (HC5). */
export async function correctTap(performanceId: string, input: { id: string, reversesId: string, reasonTermId: string, deviceLabel: string | null }): Promise<Headcount> {
  const term = await getTerm(input.reasonTermId)
  if (!term || term.vocabularyKey !== CORRECTION_REASONS || term.retired)
    refuse('box-office.headcount.bad-reason', 'That reason is not on the list of reasons for correcting a count.', { status: 422, fields: { reasonTermId: 'invalid' }, remedy: 'Choose a reason from the list.' })
  const found = await undoable(performanceId, input.reversesId, new Set())
  if ('problem' in found) {
    const reasons = { 'not-found': 'There is no such press on this performance\'s counter.', 'not-undoable': 'An undo cannot itself be undone.', 'already-undone': 'That press has already been undone.' }
    refuse(`box-office.headcount.${found.problem}`, reasons[found.problem], { status: found.problem === 'not-found' ? 404 : 409 }) // not-policy: HTTP statuses
  }
  const unit = createUnit()
  insert(unit.view(), performanceId, { id: input.id, kind: 'undo', quantity: Number(found.tap.quantity), reversesId: found.tap.id, reasonTermId: term!.id, deviceLabel: input.deviceLabel, at: nowMs(), offline: false })
  unit.audit({ action: 'correct-headcount', record: ['core.performance', performanceId], detail: { tapId: found.tap.id, kind: found.tap.kind, quantity: Number(found.tap.quantity), reason: term!.slug } })
  await unit.commit()
  return (await headcountFor([performanceId]))[performanceId]!
}

export interface RecentTap { id: string, kind: 'in' | 'out', quantity: number, tappedAt: number, deviceLabel: string | null, mine: boolean, undone: boolean }

/** The counter's latest presses, newest first, for undo and correction. */
export async function recentTaps(performanceId: string, limit: number): Promise<RecentTap[]> {
  const actor = useContext().actor.accountId
  const rows = await all<TapRow & { device_label: string | null, tapped_by: string, undone: number }>(
    `SELECT t.id, t.performance_id, t.kind, t.quantity, t.reverses_id, t.tapped_at, t.device_label, t.tapped_by,
        EXISTS (SELECT 1 FROM box_office_headcount_taps u WHERE u.reverses_id = t.id) AS undone
      FROM box_office_headcount_taps t WHERE t.performance_id = ? AND t.kind <> 'undo' ORDER BY t.tapped_at DESC, t.id DESC LIMIT ?`, performanceId, limit)
  return rows.map(r => ({ id: r.id, kind: r.kind as 'in' | 'out', quantity: Number(r.quantity), tappedAt: Number(r.tapped_at), deviceLabel: r.device_label, mine: r.tapped_by === actor, undone: !!r.undone }))
}

/** What the counter screen reads: the figures, what it offers and who may correct. */
export async function counterView(performanceId: string, limit: number) {
  return {
    headcount: (await headcountFor([performanceId]))[performanceId]!,
    countsOut: await countsOut(performanceId),
    undoWithin: await useSetting('box-office.door.undo-within') as number,
    fullWarning: await useSetting('box-office.door.full-warning') as number,
    canCorrect: (await can(useContext().actor, 'box-office.headcount.correct', ['core.performance', performanceId])).allowed,
    recent: await recentTaps(performanceId, limit),
  }
}
