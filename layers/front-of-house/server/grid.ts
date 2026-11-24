// The rota grid (FH-48): occasion shifts by day and by venue and duty, made in batches from a template.
// See docs/specs/festival-ready-changes/12-build-notes.md for batches, removal and the show night.
import { all, first, newId, nowMs, refuse, theatreTimeZone, useSetting, type UnitView } from '#kit'
import { instantOfLocal, localDateOf, localParts, previousDate } from '#kit/clock'
import { shifts } from './db/schema'
import { getCrewCall } from './crew-calls'
import { getShift, listDuties, shiftTimes } from './shifts'
import { getTemplate } from './templates'

const DAY = /^\d{4}-\d{2}-\d{2}$/ // not-policy: a date's shape
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/ // not-policy: a 24-hour time's shape
const SECOND = 1000 // not-policy: settings are whole seconds

const nextDay = (day: string): string => previousDate(day, -1)
const pad = (n: number): string => String(n).padStart(2, '0')
const wallTime = (ms: number, zone: string): string => {
  const p = localParts(ms, zone)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

/** Call and end instants for a day: an end at or before the call is the next morning. */
export function batchTimes(day: string, callTime: string, endTime: string, zone: string): { callAt: number, endsAt: number } {
  return { callAt: instantOfLocal(day, callTime, zone), endsAt: instantOfLocal(endTime <= callTime ? nextDay(day) : day, endTime, zone) }
}

export interface BatchInput {
  templateId: string
  venueId: string
  spaceId?: string | null
  title: string
  days: string[]
  callTime: string
  endTime: string
  crewCallId?: string | null
  signUp?: boolean
}

/** One template applied to several days at once, as draft shifts in one batch. */
export async function makeBatch(unit: UnitView, input: BatchInput, by: string): Promise<{ batchId: string, shiftIds: string[] }> {
  const days = [...new Set(input.days)].sort()
  if (!days.length || days.length > 31 || days.some(d => !DAY.test(d))) // not-policy: the table's bound on a batch's days
    refuse('front-of-house.batch.days', 'Choose between one and 31 days.', { status: 422, fields: { days: 'Choose between one and 31 days.' } }) // not-policy: HTTP status
  if (!TIME.test(input.callTime) || !TIME.test(input.endTime) || input.callTime === input.endTime)
    refuse('front-of-house.shift-times', 'A shift must end after its call time.', { status: 422, fields: { endTime: 'Must differ from the call time.' } }) // not-policy: HTTP status
  const template = await getTemplate(input.templateId)
  if (!template || template.archivedAt !== null) refuse('core.not-found', 'There is no such rota template, or it is archived.', { status: 404 }) // not-policy: HTTP status
  const duties = new Set((await listDuties()).map(d => d.id))
  const lines = template.lines.filter(l => duties.has(l.dutyId))
  if (!lines.length) refuse('front-of-house.batch.no-duties', 'That rota template has no duties in use.', { remedy: 'Add duties to the template first.' })
  const venue = await first<{ id: string }>('SELECT id FROM core_venues WHERE id = ?', input.venueId)
  if (!venue) refuse('core.not-found', 'There is no such venue.', { status: 404 }) // not-policy: HTTP status
  if (input.spaceId && !await first('SELECT 1 AS one FROM core_spaces WHERE id = ? AND venue_id = ?', input.spaceId, input.venueId))
    refuse('front-of-house.batch.space', 'That space is not in the venue chosen.', { status: 422, fields: { spaceId: 'Choose a space in this venue.' } }) // not-policy: HTTP status
  if (input.crewCallId) {
    const call = await getCrewCall(input.crewCallId)
    if (!call || call.state === 'archived') refuse('front-of-house.crew-call.archived', 'That crew call is archived or does not exist.', { status: 422, fields: { crewCallId: 'Choose another crew call.' } }) // not-policy: HTTP status
  }
  const zone = await theatreTimeZone()
  const at = nowMs()
  const batchId = newId('shb')
  const rows: Record<string, unknown>[] = []
  for (const day of days) {
    const { callAt, endsAt } = batchTimes(day, input.callTime, input.endTime, zone)
    const times = await shiftTimes({ callAt, endsAt, signUp: input.signUp ?? true })
    for (const line of lines) {
      rows.push({ title: input.title, venueId: input.venueId, spaceId: input.spaceId ?? null, dutyId: line.dutyId, places: line.places, ...times, state: 'draft', crewCallId: input.crewCallId ?? null, batchId, createdAt: at, updatedAt: at })
    }
  }
  unit.add({
    sql: `INSERT INTO front_of_house_shift_batches (id, crew_call_id, template_id, venue_id, space_id, title, days, call_time, end_time, made, state, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'made', ?, ?, ?)`,
    params: [batchId, input.crewCallId ?? null, template.id, input.venueId, input.spaceId ?? null, input.title, JSON.stringify(days), input.callTime, input.endTime, rows.length, by, at, at],
  })
  const shiftIds = unit.insertSet(shifts, rows)
  unit.expect(rows.length)
  unit.audit({ action: 'create', detail: { batch: batchId, template: template.id, days: days.length, shifts: rows.length } })
  return { batchId, shiftIds }
}

export interface Kept { shiftId: string, dutyName: string, callAt: number, placesTaken: number }

/** Removes a batch: shifts nobody holds a place on are cancelled in one statement; the rest are listed. */
export async function removeBatch(unit: UnitView, batchId: string): Promise<{ cancelled: number, kept: Kept[] }> {
  const batch = await first<{ id: string, state: string }>('SELECT id, state FROM front_of_house_shift_batches WHERE id = ?', batchId)
  if (!batch) refuse('core.not-found', 'There is no such batch.', { status: 404 }) // not-policy: HTTP status
  if (batch.state === 'removed') refuse('front-of-house.batch.removed', 'This batch has already been removed.')
  const kept = await all<{ id: string, duty_name: string, call_at: number, places_taken: number }>(
    `SELECT s.id, d.name AS duty_name, s.call_at, s.places_taken FROM front_of_house_shifts s JOIN front_of_house_duties d ON d.id = s.duty_id
      WHERE s.batch_id = ? AND s.state IN ('draft', 'published') AND s.places_taken > 0 ORDER BY s.call_at`, batchId)
  const open = await first<{ n: number }>('SELECT count(*) AS n FROM front_of_house_shifts WHERE batch_id = ? AND state IN (\'draft\', \'published\') AND places_taken = 0', batchId)
  const at = nowMs()
  // Taken places are judged by the statement, so a sign-up racing this keeps its shift.
  unit.add({
    sql: `UPDATE front_of_house_shifts SET state = 'cancelled', cancelled_reason = 'The batch was removed.', updated_at = ?
      WHERE batch_id = ? AND state IN ('draft', 'published') AND places_taken = 0`,
    params: [at, batchId],
  })
  unit.add({ sql: 'UPDATE front_of_house_shift_batches SET state = \'removed\', updated_at = ? WHERE id = ? AND state = \'made\'', params: [at, batchId] })
    .expect(1, { code: 'front-of-house.batch.removed', reason: 'This batch has just been removed.' })
  unit.audit({ action: 'update', detail: { batch: batchId, removed: true, kept: kept.length } })
  return { cancelled: Number(open?.n ?? 0), kept: kept.map(k => ({ shiftId: k.id, dutyName: k.duty_name, callAt: k.call_at, placesTaken: k.places_taken })) }
}

/** Copies a shift not tied to a performance to other days, at the same local times, as drafts. */
export async function copyShift(unit: UnitView, shiftId: string, days: string[]): Promise<string[]> {
  const shift = await getShift(shiftId)
  if (!shift) refuse('core.not-found', 'There is no such shift.', { status: 404 }) // not-policy: HTTP status
  if (shift.performanceId) refuse('front-of-house.copy.performance', 'A performance\'s shift belongs to its performance.', { remedy: 'Apply a rota template to the other performances instead.' })
  const zone = await theatreTimeZone()
  const callTime = wallTime(shift.callAt, zone)
  const endTime = wallTime(shift.endsAt, zone)
  const at = nowMs()
  const rows: Record<string, unknown>[] = []
  for (const day of [...new Set(days)].filter(d => DAY.test(d)).sort()) {
    const { callAt, endsAt } = batchTimes(day, callTime, endTime, zone)
    const times = await shiftTimes({ callAt, endsAt, signUp: shift.signUpClosesAt !== null })
    rows.push({ title: shift.title, venueId: shift.venueId, spaceId: shift.spaceId, dutyId: shift.dutyId, places: shift.places, briefing: shift.briefing, ...times, state: 'draft', crewCallId: shift.crewCallId, createdAt: at, updatedAt: at })
  }
  if (!rows.length) return []
  const ids = unit.insertSet(shifts, rows)
  unit.expect(rows.length)
  unit.audit(ids.map(id => ({ action: 'create', record: ['front-of-house.shift', id] as const, detail: { copiedFrom: shiftId } })))
  return ids
}

export interface GridShift { id: string, title: string | null, callAt: number, endsAt: number, places: number, placesTaken: number, state: string, batchId: string | null, crewCallId: string | null, urgent: boolean }
export interface GridRow { venueId: string | null, venueName: string, dutyId: string, dutyName: string, cells: Record<string, GridShift[]> }
export interface GridQuery { from: string, to: string, crewCallId?: string, venueId?: string, dutyId?: string, unfilled?: boolean }

/** Occasion shifts fill venue and duty rows; a performance's shifts are only counted per venue and day. */
export async function gridView(q: GridQuery): Promise<{ days: string[], rows: GridRow[], performances: { venueId: string, venueName: string, day: string, shifts: number, performanceIds: string[] }[] }> {
  const zone = await theatreTimeZone()
  const days: string[] = []
  for (let d = q.from; d <= q.to && days.length < 42; d = nextDay(d)) days.push(d) // not-policy: the most days the grid draws at once
  // The show night runs 04:00 to 04:00 (0014), so a 01:00 call belongs to the day before.
  const start = instantOfLocal(q.from, '04:00', zone)
  const end = instantOfLocal(nextDay(q.to), '04:00', zone)
  const closes = await useSetting('front-of-house.shifts.sign-up-closes') as number
  const now = nowMs()
  const filters: string[] = []
  const params: unknown[] = [start, end]
  if (q.crewCallId) {
    filters.push('s.crew_call_id = ?')
    params.push(q.crewCallId)
  }
  if (q.venueId) {
    filters.push('s.venue_id = ?')
    params.push(q.venueId)
  }
  if (q.dutyId) {
    filters.push('s.duty_id = ?')
    params.push(q.dutyId)
  }
  if (q.unfilled) filters.push('s.places_taken < s.places')
  const rows = await all<{ id: string, performance_id: string | null, venue_id: string | null, venue_name: string | null, title: string | null, duty_id: string, duty_name: string, sort_order: number, call_at: number, ends_at: number, places: number, places_taken: number, state: string, batch_id: string | null, crew_call_id: string | null }>(
    `SELECT s.id, s.performance_id, s.venue_id, v.name AS venue_name, s.title, s.duty_id, d.name AS duty_name, d.sort_order, s.call_at, s.ends_at, s.places, s.places_taken, s.state, s.batch_id, s.crew_call_id
       FROM front_of_house_shifts s JOIN front_of_house_duties d ON d.id = s.duty_id LEFT JOIN core_venues v ON v.id = s.venue_id
      WHERE s.call_at >= ? AND s.call_at < ? AND s.state <> 'cancelled' ${filters.map(f => `AND ${f}`).join(' ')}
      ORDER BY v.name, d.sort_order, d.name, s.call_at`, ...params)
  const grid = new Map<string, GridRow>()
  const perf = new Map<string, { venueId: string, venueName: string, day: string, shifts: number, performanceIds: string[] }>()
  for (const r of rows) {
    const day = showDay(r.call_at, zone)
    if (r.performance_id) {
      const key = `${r.venue_id}|${day}`
      const p = perf.get(key) ?? { venueId: r.venue_id ?? '', venueName: r.venue_name ?? '', day, shifts: 0, performanceIds: [] }
      p.shifts++
      if (!p.performanceIds.includes(r.performance_id)) p.performanceIds.push(r.performance_id)
      perf.set(key, p)
      continue
    }
    const key = `${r.venue_id ?? ''}|${r.duty_id}`
    const row = grid.get(key) ?? { venueId: r.venue_id, venueName: r.venue_name ?? '', dutyId: r.duty_id, dutyName: r.duty_name, cells: {} }
    const unfilled = r.places_taken < r.places && r.state !== 'completed'
    ;(row.cells[day] ??= []).push({ id: r.id, title: r.title, callAt: r.call_at, endsAt: r.ends_at, places: r.places, placesTaken: r.places_taken, state: r.state, batchId: r.batch_id, crewCallId: r.crew_call_id, urgent: unfilled && r.call_at - now <= closes * SECOND })
    grid.set(key, row)
  }
  return { days, rows: [...grid.values()], performances: [...perf.values()] }
}

/** The show night an instant belongs to: before 04:00 it is still the night before (0014). */
function showDay(ms: number, zone: string): string {
  const day = localDateOf(ms, zone)
  return localParts(ms, zone).hour < 4 ? previousDate(day) : day // not-policy: the show night's 04:00 boundary (0014)
}

export interface BatchSummary { id: string, title: string, venueName: string, days: string[], callTime: string, endTime: string, made: number, state: string, templateName: string }

export async function listBatches(options: { crewCallId?: string } = {}): Promise<BatchSummary[]> {
  const rows = await all<{ id: string, title: string, venue_name: string, days: string, call_time: string, end_time: string, made: number, state: string, template_name: string }>(
    `SELECT b.id, b.title, v.name AS venue_name, b.days, b.call_time, b.end_time, b.made, b.state, t.name AS template_name
       FROM front_of_house_shift_batches b JOIN core_venues v ON v.id = b.venue_id JOIN front_of_house_rota_templates t ON t.id = b.template_id
      WHERE b.state = 'made' ${options.crewCallId ? 'AND b.crew_call_id = ?' : ''} ORDER BY b.created_at DESC`, ...(options.crewCallId ? [options.crewCallId] : []))
  return rows.map(r => ({ id: r.id, title: r.title, venueName: r.venue_name, days: JSON.parse(r.days) as string[], callTime: r.call_time, endTime: r.end_time, made: r.made, state: r.state, templateName: r.template_name }))
}
