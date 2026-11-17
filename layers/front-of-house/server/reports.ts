// The night report (part 3, "The night report"; FH-31 to FH-33). A draft exists from the first
// shift window of the performance and is a live view: nothing is copied until sign-off. Sign-off
// resolves who worked, compiles the snapshot (no names, no free text), and tells those who read
// reports. After it the row cannot change; a correction is an addendum.
import { all, first, newId, nowMs, refuse, usePoint, useSetting, type UnitView } from '#kit'
import { getPerformance, holdersOf, notify } from '#modules/core'
import { AUTHORITY_STATES, type NOTE_TOPICS } from './db/schema'
import { reference } from './incidents'
import type { ReportSection } from './points/report-section'

export type NoteTopic = typeof NOTE_TOPICS[number]

const SECTION_BUDGET = 3000 // not-policy: how long sign-off waits for one module's section, in milliseconds
const MINUTE = 60_000 // not-policy: unit conversion
const authority = AUTHORITY_STATES.map(s => `'${s}'`).join(', ')

export interface Snapshot {
  timings: { kind: string, at: number }[]
  duties: { dutyId: string, duty: string, worked: number, noShows: number }[]
  checklists: { checklistId: string, name: string, state: string, exceptions: { item: string, reasonCode: string | null }[] }[]
  incidents: { id: string, reference: string, kind: string, severity: string }[]
  sections: { id: string, label: string, lines: { label: string, value: string | number, unit?: string }[] | null }[]
}

async function compileSection(section: ReportSection, performanceId: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), SECTION_BUDGET)
    })
    return await Promise.race([Promise.resolve(section.compile(performanceId)), late])
  }
  catch {
    return null
  }
  finally {
    clearTimeout(timer)
  }
}

/**
 * Reads everything the report shows. `outcomes` stands in for the assignments not yet resolved:
 * at sign-off, those named no-show and the rest worked.
 */
export async function compile(performanceId: string, outcomes?: { noShows: Set<string> }): Promise<Snapshot> {
  const timings = await all<{ kind: string, at: number }>('SELECT kind, at FROM front_of_house_timings WHERE performance_id = ? ORDER BY at', performanceId)
  const people = await all<{ id: string, state: string, duty_id: string, duty: string }>(
    `SELECT a.id, a.state, s.duty_id, d.name AS duty FROM front_of_house_assignments a
      JOIN front_of_house_shifts s ON s.id = a.shift_id JOIN front_of_house_duties d ON d.id = s.duty_id
     WHERE s.performance_id = ? AND a.state IN (${authority}, 'worked', 'no_show') ORDER BY d.sort_order, d.name`, performanceId)
  const duties = new Map<string, Snapshot['duties'][number]>()
  for (const p of people) {
    const outcome = (AUTHORITY_STATES as readonly string[]).includes(p.state) ? (outcomes?.noShows.has(p.id) ? 'no_show' : outcomes ? 'worked' : null) : p.state
    const entry = duties.get(p.duty_id) ?? { dutyId: p.duty_id, duty: p.duty, worked: 0, noShows: 0 }
    if (outcome === 'worked') entry.worked++
    if (outcome === 'no_show') entry.noShows++
    duties.set(p.duty_id, entry)
  }
  const runs = await all<{ id: string, checklist_id: string, name: string, state: string }>(
    'SELECT r.id, r.checklist_id, c.name, r.state FROM front_of_house_checklist_runs r JOIN front_of_house_checklists c ON c.id = r.checklist_id WHERE r.performance_id = ? ORDER BY c.sort_order, c.name', performanceId)
  const exceptions = await all<{ run_id: string, label: string, reason_code: string | null }>(
    `SELECT e.run_id, e.label, e.reason_code FROM front_of_house_checklist_entries e JOIN front_of_house_checklist_runs r ON r.id = e.run_id
     WHERE r.performance_id = ? AND e.outcome = 'exception' ORDER BY e.created_at`, performanceId)
  const incidents = await all<{ id: string, year: number, number: number, kind: string, severity: string }>(
    'SELECT id, year, number, kind, severity FROM front_of_house_incidents WHERE performance_id = ? ORDER BY year, number', performanceId)
  const sections: Snapshot['sections'] = []
  for (const c of await usePoint<ReportSection>('front-of-house.report-section'))
    sections.push({ id: c.id, label: c.value.label, lines: await compileSection(c.value, performanceId) })
  return {
    timings,
    duties: [...duties.values()],
    checklists: runs.map(r => ({ checklistId: r.checklist_id, name: r.name, state: r.state, exceptions: exceptions.filter(e => e.run_id === r.id).map(e => ({ item: e.label, reasonCode: e.reason_code })) })),
    incidents: incidents.map(i => ({ id: i.id, reference: reference(i.year, i.number), kind: i.kind, severity: i.severity })),
    sections,
  }
}

/** Makes the draft report for a performance if there is none. Safe to repeat. */
export function ensureDraft(unit: UnitView, performanceId: string): void {
  const at = nowMs()
  unit.add({
    sql: 'INSERT INTO front_of_house_night_reports (id, performance_id, state, snapshot_version, created_at, updated_at) VALUES (?, ?, \'draft\', 1, ?, ?) ON CONFLICT DO NOTHING',
    params: [newId('nrp'), performanceId, at, at],
  })
}

interface ReportRow { id: string, state: 'draft' | 'signed_off', snapshot: string | null, signed_off_by: string | null, signed_off_at: number | null, distributed_at: number | null }

const reportOf = (performanceId: string) => first<ReportRow>('SELECT * FROM front_of_house_night_reports WHERE performance_id = ?', performanceId)

/** What sign-off would leave unresolved: shown first on the page. Only the people are resolved by it. */
export async function unresolved(performanceId: string) {
  const people = await all<{ id: string, account_id: string, state: string, duty: string }>(
    `SELECT a.id, a.account_id, a.state, d.name AS duty FROM front_of_house_assignments a
      JOIN front_of_house_shifts s ON s.id = a.shift_id JOIN front_of_house_duties d ON d.id = s.duty_id
     WHERE s.performance_id = ? AND a.state IN (${authority}) ORDER BY d.sort_order, a.created_at`, performanceId)
  const openRuns = await all<{ checklist_id: string }>('SELECT checklist_id FROM front_of_house_checklist_runs WHERE performance_id = ? AND state = \'open\'', performanceId)
  const recorded = new Set((await all<{ kind: string }>('SELECT kind FROM front_of_house_timings WHERE performance_id = ?', performanceId)).map(t => t.kind))
  return {
    people: people.map(p => ({ assignmentId: p.id, accountId: p.account_id, state: p.state, duty: p.duty })),
    openChecklists: openRuns.map(r => r.checklist_id),
    missingTimings: ['house_open', 'curtain_up', 'curtain_down', 'house_clear'].filter(k => !recorded.has(k)),
  }
}

export async function readReport(performanceId: string) {
  const report = await reportOf(performanceId)
  const notes = report
    ? await all<{ id: string, kind: 'note' | 'addendum', topic: NoteTopic, body: string, author_id: string, created_at: number }>(
        'SELECT * FROM front_of_house_night_report_notes WHERE report_id = ? ORDER BY created_at, rowid', report.id)
    : []
  const signed = report?.state === 'signed_off'
  return {
    id: report?.id ?? null,
    performanceId,
    state: report?.state ?? 'draft',
    signedOffBy: report?.signed_off_by ?? null,
    signedOffAt: report?.signed_off_at ?? null,
    report: signed ? JSON.parse(report!.snapshot!) as Snapshot : await compile(performanceId),
    unresolved: signed ? null : await unresolved(performanceId),
    notes: notes.map(n => ({ id: n.id, kind: n.kind, topic: n.topic, body: n.body, authorId: n.author_id, at: n.created_at })),
  }
}

/** A note on the night, or an addendum once the report is signed off. */
export async function addNote(unit: UnitView, input: { performanceId: string, topic: NoteTopic, body: string, by: string }): Promise<string> {
  await getPerformance(input.performanceId)
  ensureDraft(unit, input.performanceId)
  const id = newId('nrn')
  unit.add({
    sql: `INSERT INTO front_of_house_night_report_notes (id, report_id, kind, topic, body, author_id, created_at)
      SELECT ?, r.id, CASE r.state WHEN 'signed_off' THEN 'addendum' ELSE 'note' END, ?, ?, ?, ? FROM front_of_house_night_reports r WHERE r.performance_id = ?`,
    params: [id, input.topic, input.body, input.by, nowMs(), input.performanceId],
  }).expect(1)
  unit.audit({ action: 'create', record: ['core.performance', input.performanceId], detail: { note: id, topic: input.topic } })
  return id
}

/** Minutes worked, by the hours.count-from setting: the shift's times, or check-in to check-out when both exist. */
async function minutesSql(): Promise<string> {
  const from = await useSetting('front-of-house.hours.count-from')
  const scheduled = `(SELECT (s.ends_at - s.call_at) / ${MINUTE} FROM front_of_house_shifts s WHERE s.id = shift_id)`
  return from === 'checked'
    ? `CASE WHEN checked_in_at IS NOT NULL AND checked_out_at IS NOT NULL AND checked_out_at > checked_in_at THEN (checked_out_at - checked_in_at) / ${MINUTE} ELSE ${scheduled} END`
    : scheduled
}

/** Resolves the people on shifts: those named no-show, the rest worked with their minutes. One statement. */
export async function resolvePeople(unit: UnitView, where: { performanceId?: string, shiftIds?: string[] }, noShows: string[], by: string | null): Promise<void> {
  const at = nowMs()
  const scope = where.performanceId
    ? 'shift_id IN (SELECT id FROM front_of_house_shifts WHERE performance_id = ?)'
    : 'shift_id IN (SELECT value FROM json_each(?))'
  unit.add({
    sql: `UPDATE front_of_house_assignments SET
        state = CASE WHEN id IN (SELECT value FROM json_each(?)) THEN 'no_show' ELSE 'worked' END,
        minutes_worked = CASE WHEN id IN (SELECT value FROM json_each(?)) THEN NULL ELSE ${await minutesSql()} END,
        ended_at = ?, ended_by = ?, updated_at = ? -- exact-account: sets who resolved it, not a read
      WHERE ${scope} AND state IN (${authority})`,
    params: [JSON.stringify(noShows), JSON.stringify(noShows), at, by, at, where.performanceId ?? JSON.stringify(where.shiftIds ?? [])],
  })
}

/**
 * Signs off the night in one unit: resolves the people (default worked), writes the snapshot, sets
 * the state and announces it. Distribution follows when the theatre has it on.
 */
export async function signOff(unit: UnitView, input: { performanceId: string, noShows: string[], by: string }): Promise<{ signedOff: true }> {
  const performance = await getPerformance(input.performanceId)
  const existing = await reportOf(input.performanceId)
  if (existing?.state === 'signed_off') refuse('front-of-house.report-signed-off', 'This night is already signed off.', { remedy: 'Add an addendum instead.' })
  const open = new Set((await unresolved(input.performanceId)).people.map(p => p.assignmentId))
  for (const id of input.noShows) if (!open.has(id)) refuse('front-of-house.not-on-shift', 'One of those people is not on tonight\'s rota, or is already resolved.', { status: 422 })
  const snapshot = await compile(input.performanceId, { noShows: new Set(input.noShows) })
  const at = nowMs()
  ensureDraft(unit, input.performanceId)
  await resolvePeople(unit, { performanceId: input.performanceId }, input.noShows, input.by)
  unit.add({
    sql: 'UPDATE front_of_house_night_reports SET state = \'signed_off\', snapshot = ?, signed_off_by = ?, signed_off_at = ?, updated_at = ? WHERE performance_id = ? AND state = \'draft\'',
    params: [JSON.stringify(snapshot), input.by, at, at, input.performanceId],
  }).expect(1, { code: 'front-of-house.report-signed-off', reason: 'This night is already signed off.', remedy: 'Add an addendum instead.' })
  unit.announce('front-of-house.night-report.signed-off', { performanceId: input.performanceId }, { record: ['core.performance', input.performanceId] })
  unit.audit({ action: 'state', record: ['core.performance', input.performanceId], detail: { to: 'signed_off', noShows: input.noShows.length } })
  if (await useSetting('front-of-house.night-report.auto-distribute') === true) {
    const readers = await holdersOf('front-of-house.night-report.view', ['core.performance', input.performanceId] as const)
    if (readers.length) {
      const worked = snapshot.duties.reduce((n, d) => n + d.worked, 0)
      await notify(unit, 'front-of-house.night-report-ready', {
        to: readers,
        variables: { show: performance.productionTitle, worked: String(worked), incidents: String(snapshot.incidents.length), performance: input.performanceId },
        dedupeKey: `report:${input.performanceId}`,
      })
    }
    unit.add({ sql: 'UPDATE front_of_house_night_reports SET distributed_at = ? WHERE performance_id = ?', params: [at, input.performanceId] })
  }
  return { signedOff: true }
}

/** A manager sets one person's outcome or corrects their minutes, after the night; audited. */
export async function setOutcome(unit: UnitView, assignmentId: string, input: { state: 'worked' | 'no_show', minutes?: number | null, by: string }): Promise<void> {
  const row = await first<{ state: string }>('SELECT state FROM front_of_house_assignments WHERE id = ?', assignmentId)
  if (!row) refuse('core.not-found', 'There is no such place on a shift.', { status: 404 })
  const at = nowMs()
  const minutes = input.state === 'no_show' ? 'NULL' : input.minutes !== undefined && input.minutes !== null ? '?' : await minutesSql()
  unit.add({
    sql: `UPDATE front_of_house_assignments SET state = ?, minutes_worked = ${minutes}, ended_at = coalesce(ended_at, ?), ended_by = coalesce(ended_by, ?), updated_at = ?
      WHERE id = ? AND state IN (${authority}, 'worked', 'no_show')`,
    params: [input.state, ...(minutes === '?' ? [input.minutes] : []), at, input.by, at, assignmentId],
  }).expect(1, { code: 'front-of-house.assignment-ended', reason: 'This person was not on the shift.' })
  unit.audit({ action: 'update', record: ['front-of-house.assignment', assignmentId], detail: { from: row.state, to: input.state, minutes: input.minutes ?? null } })
}

/** Performances whose report is still a draft long after the end, for the morning chase (FH-33). */
export async function chaseReports(unit: UnitView): Promise<number> {
  const after = await useSetting('front-of-house.night-report.sign-off-by') as number
  const drafts = await all<{ performance_id: string }>('SELECT performance_id FROM front_of_house_night_reports WHERE state = \'draft\'')
  let sent = 0
  for (const d of drafts) {
    const performance = await getPerformance(d.performance_id)
    if (nowMs() - performance.endsAt < after * 1000) continue // not-policy: seconds to milliseconds
    const managers = await holdersOf('front-of-house.night-report.sign-off', ['core.performance', d.performance_id] as const)
    if (!managers.length) continue
    await notify(unit, 'front-of-house.night-report-unsigned', {
      to: managers,
      variables: { show: performance.productionTitle, performance: d.performance_id },
      dedupeKey: `unsigned:${d.performance_id}:${new Date(nowMs()).toISOString().slice(0, 10)}`,
    })
    sent++
  }
  return sent
}
