// Incidents and near misses (part 3, "Incidents"; FH-27 to FH-30). A report asks for the least that
// makes a useful record, from anyone who holds incident.report, offline if need be. Review adds the
// category, the people involved and follow-up actions. No notification carries what happened, a
// person's name or a welfare detail: only the number, kind, severity and a link.
import { accountScopeSql } from '#kit/accounts'
import { all, first, localDate, newId, nowMs, openSpecial, refuse, sealSpecial, useSetting, type UnitView } from '#kit'
import { sql } from 'drizzle-orm'
import { accountLabel, assertTerm, canonicalAccount, holdersOf, notify, type PickerPerson } from '#modules/core'
import type { INVOLVEMENTS, INCIDENT_KINDS } from './db/schema'
import { LIVE_STATES, SEVERITIES } from './db/schema'

export const CATEGORIES = 'front-of-house.incident-category'

export type IncidentKind = typeof INCIDENT_KINDS[number]
export type Severity = typeof SEVERITIES[number]
export type Involvement = typeof INVOLVEMENTS[number]

// Who counts as working a performance, for the report's Who step (IN-1): anyone holding a place on
// one of its shifts that is not cancelled, checked in, or who has worked it.
const WORKING = [...LIVE_STATES, 'worked'].map(s => `'${s}'`).join(', ')
const WORKING_ON = `SELECT s.account_id FROM front_of_house_assignments s JOIN front_of_house_shifts sh ON sh.id = s.shift_id
  WHERE sh.performance_id = ? AND sh.state <> 'cancelled' AND s.state IN (${WORKING})`

/**
 * The people working a performance whose name matches every word typed, in the core picker's shape
 * (a name and enough to tell two apart, never contact details).
 */
export async function workingPeople(performanceId: string, text: string): Promise<PickerPerson[]> {
  const rows = await all<{ id: string, name: string | null, preferred_name: string | null, created_at: number, first_signed_in_at: number | null, disabled_at: number | null }>(
    `SELECT a.id, a.name, a.preferred_name, a.created_at, a.first_signed_in_at, a.disabled_at FROM core_accounts a
      WHERE a.id IN (${WORKING_ON}) AND a.merged_into_id IS NULL AND a.anonymised_at IS NULL ORDER BY a.name`, performanceId)
  const words = text.toLowerCase().split(/\s+/).filter(Boolean)
  return rows
    .filter(r => words.every(w => `${r.preferred_name ?? ''} ${r.name ?? ''}`.toLowerCase().includes(w)))
    .map(r => ({ id: r.id, label: r.name || 'Unnamed person', name: r.name, since: r.created_at, claimed: !!r.first_signed_in_at, disabled: !!r.disabled_at }))
}

const rank = (s: Severity) => SEVERITIES.indexOf(s)
export const reference = (year: number, number: number) => `INC-${year}-${String(number).padStart(4, '0')}` // not-policy: the shown format, "INC-2026-0042"

// ---------------------------------------------------------------------------------------------
// Reporting (FH-27, FH-28)

export interface ReportInput {
  kind: IncidentKind
  occurredAt: number
  performanceId?: string | null
  venueId?: string | null
  spaceId?: string | null
  whereNote?: string | null
  whatHappened: string
  immediateAction?: string | null
  firstAidGiven?: boolean
  emergencyServicesCalled?: boolean
  /** The reporter marks it serious. */
  serious?: boolean
  /** Who was involved, as the reporter names them (IN-1). */
  people?: ReportPerson[]
  by: string
}

/** Someone named in a report: an account, or a name and a way to reach them, and how they were involved. */
export interface ReportPerson { accountId?: string | null, name?: string | null, contact?: string | null, involvement: Involvement }

/** The severity at report: serious when marked, at least moderate when either flag is set. */
export function severityAtReport(input: Pick<ReportInput, 'serious' | 'firstAidGiven' | 'emergencyServicesCalled'>): Severity {
  if (input.serious) return 'serious'
  return input.firstAidGiven || input.emergencyServicesCalled ? 'moderate' : 'minor'
}

/**
 * Records an incident and gives it the next number of the year. Holders of incident.manage are told
 * at once when it is at or above the immediate severity; the rest wait for the daily digest.
 */
export async function reportIncident(unit: UnitView, input: ReportInput): Promise<{ incidentId: string, reference: string, severity: Severity }> {
  const at = nowMs()
  if (input.occurredAt > at) refuse('front-of-house.incident-in-future', 'An incident cannot have happened in the future.', { status: 422, fields: { occurredAt: 'Not later than now.' } })
  const year = Number((await localDate(input.occurredAt)).slice(0, 4)) // not-policy: the year of a YYYY-MM-DD date
  const severity = severityAtReport(input)
  const id = newId('inc')
  // Read first so the message can carry the number; two reports in the same instant meet the unique
  // index on (year, number), and the second is refused whole and can be sent again.
  const number = (await first<{ next: number }>('SELECT coalesce(max(number), 0) + 1 AS next FROM front_of_house_incidents WHERE year = ?', year))!.next
  unit.add({
    sql: `INSERT INTO front_of_house_incidents (id, number, year, kind, severity, state, performance_id, venue_id, space_id, where_note, occurred_at,
        what_happened, immediate_action, first_aid_given, emergency_services_called, reported_by, reported_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'reported', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [id, number, year, input.kind, severity, input.performanceId ?? null, input.venueId ?? null, input.spaceId ?? null, input.whereNote ?? null, input.occurredAt,
      input.whatHappened, input.immediateAction ?? null, input.firstAidGiven ? 1 : 0, input.emergencyServicesCalled ? 1 : 0, input.by, at, at, at],
  })
  // The people the reporter names (IN-1): an account must be someone working the performance the
  // report is about (none without a performance), and a name stands alone with its contact. Welfare details are the reviewer's to add.
  for (const p of input.people ?? []) {
    if (!p.accountId && !p.name) refuse('front-of-house.person-unnamed', 'Choose the person\'s account, or give their name.', { status: 422, fields: { people: 'A name, or choose an account.' } })
    const accountId = p.accountId ? await canonicalAccount(p.accountId) : null
    unit.add({
      sql: `INSERT INTO front_of_house_incident_people (id, incident_id, account_id, name, contact, involvement, is_child, from_report, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, 0, 1, ?, ? WHERE ? IS NULL OR ? IN (${WORKING_ON})`,
      params: [newId('inp'), id, accountId, accountId ? null : p.name ?? null, accountId ? null : p.contact ?? null, p.involvement, at, at, accountId, accountId, input.performanceId ?? null],
    }).expect(1, { code: 'front-of-house.person-not-working', reason: 'One of the people chosen is not working this performance.', remedy: 'Give their name as someone else instead.' })
  }
  unit.announce('front-of-house.incident.reported', { incidentId: id, severity }, { record: ['front-of-house.incident', id] })
  unit.audit({ action: 'create', record: ['front-of-house.incident', id], detail: { kind: input.kind, severity, people: input.people?.length ?? 0 } })
  const threshold = await useSetting('front-of-house.incidents.immediate-severity') as Severity
  if (rank(severity) >= rank(threshold)) {
    const managers = await holdersOf('front-of-house.incident.manage')
    if (managers.length) {
      await notify(unit, 'front-of-house.incident-reported', {
        to: managers,
        variables: { reference: reference(year, number), kind: kindWords(input.kind), severity: severityWords(severity), incident: id },
        dedupeKey: `reported:${id}`,
      })
    }
    unit.add({ sql: 'UPDATE front_of_house_incidents SET digested_at = ? WHERE id = ?', params: [at, id] })
  }
  return { incidentId: id, reference: reference(year, number), severity }
}

const kindWords = (kind: IncidentKind) => (kind === 'near_miss' ? 'Near miss' : 'Incident')
const severityWords = (s: Severity) => s.charAt(0).toUpperCase() + s.slice(1)

// ---------------------------------------------------------------------------------------------
// Reading

interface IncidentRow {
  id: string
  number: number
  year: number
  kind: IncidentKind
  category_id: string | null
  severity: Severity
  state: 'reported' | 'in_review' | 'closed'
  performance_id: string | null
  venue_id: string | null
  space_id: string | null
  where_note: string | null
  occurred_at: number
  what_happened: string
  immediate_action: string | null
  first_aid_given: number
  emergency_services_called: number
  reported_by: string
  reported_at: number
  reviewer_id: string | null
  closed_by: string | null
  closed_at: number | null
  closing_note: string | null
}

async function row(id: string): Promise<IncidentRow> {
  const r = await first<IncidentRow>('SELECT * FROM front_of_house_incidents WHERE id = ?', id)
  if (!r) refuse('core.not-found', 'There is no such incident.', { status: 404 })
  return r
}

/** Someone the reporter named, as they see it again: the name and how they were involved. */
export interface NamedPerson { name: string, involvement: Involvement }

/**
 * What a reporter sees of their own reports: number, kind, state, their own words and the people they
 * named (IN-1). Nothing the reviewers added.
 */
export async function myReports(accountId: string): Promise<{ id: string, reference: string, kind: IncidentKind, state: IncidentRow['state'], occurredAt: number, whatHappened: string, people: NamedPerson[] }[]> {
  const rows = await all<IncidentRow>(`SELECT * FROM front_of_house_incidents WHERE reported_by IN (${accountScopeSql('?1')}) ORDER BY reported_at DESC`, accountId)
  const named = rows.length
    ? await all<{ incident_id: string, account_id: string | null, name: string | null, involvement: Involvement }>(
        `SELECT incident_id, account_id, name, involvement FROM front_of_house_incident_people
          WHERE from_report = 1 AND incident_id IN (SELECT value FROM json_each(?)) ORDER BY created_at, rowid`, JSON.stringify(rows.map(r => r.id)))
    : []
  const people = new Map<string, NamedPerson[]>()
  for (const p of named) {
    const name = p.name ?? (p.account_id ? await accountLabel(p.account_id) : null)
    if (!name) continue
    people.set(p.incident_id, [...people.get(p.incident_id) ?? [], { name, involvement: p.involvement }])
  }
  return rows.map(r => ({ id: r.id, reference: reference(r.year, r.number), kind: r.kind, state: r.state, occurredAt: r.occurred_at, whatHappened: r.what_happened, people: people.get(r.id) ?? [] }))
}

export interface IncidentPerson { id: string, accountId: string | null, name: string | null, contact: string | null, involvement: Involvement, isChild: boolean, details: string | null, fromReport: boolean }
export interface IncidentAction { id: string, what: string, ownerId: string | null, dueOn: string | null, state: 'open' | 'done' | 'dropped', resolvedAt: number | null, resolvedNote: string | null }

/** The whole incident, for holders of incident.view: people with their welfare details, actions and the log. */
export async function readIncident(id: string) {
  const r = await row(id)
  const people = await all<{ id: string, account_id: string | null, name: string | null, contact: string | null, involvement: Involvement, is_child: number, details: string | null, from_report: number }>(
    'SELECT id, account_id, name, contact, involvement, is_child, details, from_report FROM front_of_house_incident_people WHERE incident_id = ? ORDER BY created_at', id)
  const actions = await all<{ id: string, what: string, owner_id: string | null, due_on: string | null, state: IncidentAction['state'], resolved_at: number | null, resolved_note: string | null }>(
    'SELECT * FROM front_of_house_incident_actions WHERE incident_id = ? ORDER BY created_at', id)
  const updates = await all<{ id: string, kind: string, from_value: string | null, to_value: string | null, body: string | null, author_id: string, created_at: number }>(
    'SELECT * FROM front_of_house_incident_updates WHERE incident_id = ? ORDER BY created_at, rowid', id)
  return {
    id: r.id, reference: reference(r.year, r.number), kind: r.kind, categoryId: r.category_id, severity: r.severity, state: r.state,
    performanceId: r.performance_id, venueId: r.venue_id, spaceId: r.space_id, whereNote: r.where_note, occurredAt: r.occurred_at,
    whatHappened: r.what_happened, immediateAction: r.immediate_action, firstAidGiven: !!r.first_aid_given, emergencyServicesCalled: !!r.emergency_services_called,
    reportedBy: { id: r.reported_by, name: await accountLabel(r.reported_by) }, reportedAt: r.reported_at,
    reviewerId: r.reviewer_id, closedBy: r.closed_by, closedAt: r.closed_at, closingNote: r.closing_note,
    people: await Promise.all(people.map(async (p): Promise<IncidentPerson> => ({
      id: p.id, accountId: p.account_id, name: p.name ?? (p.account_id ? await accountLabel(p.account_id) : null), contact: p.contact,
      involvement: p.involvement, isChild: !!p.is_child, details: await openSpecial(p.details), fromReport: !!p.from_report,
    }))),
    actions: actions.map((a): IncidentAction => ({ id: a.id, what: a.what, ownerId: a.owner_id, dueOn: a.due_on, state: a.state, resolvedAt: a.resolved_at, resolvedNote: a.resolved_note })),
    updates: updates.map(u => ({ id: u.id, kind: u.kind, from: u.from_value, to: u.to_value, body: u.body, authorId: u.author_id, at: u.created_at })),
  }
}

// ---------------------------------------------------------------------------------------------
// Review (FH-29)

function log(unit: UnitView, incidentId: string, entry: { kind: 'comment' | 'state' | 'severity' | 'category', from?: string | null, to?: string | null, body?: string | null, by: string }): void {
  const at = nowMs()
  unit.add({
    sql: 'INSERT INTO front_of_house_incident_updates (id, incident_id, kind, from_value, to_value, body, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    params: [newId('inu'), incidentId, entry.kind, entry.from ?? null, entry.to ?? null, entry.body ?? null, entry.by, at],
  })
}

const NOT_OPEN = { code: 'front-of-house.incident-closed', reason: 'This incident is closed.', remedy: 'Reopen it first.' }

/** Opening a reported incident as a reviewer moves it to in review. Safe to repeat. */
export async function openForReview(unit: UnitView, id: string, by: string): Promise<void> {
  const r = await row(id)
  if (r.state !== 'reported') return
  unit.add({ sql: 'UPDATE front_of_house_incidents SET state = \'in_review\', reviewer_id = ?, updated_at = ? WHERE id = ? AND state = \'reported\'', params: [by, nowMs(), id] })
  log(unit, id, { kind: 'state', from: 'reported', to: 'in_review', by })
}

export interface ReviewInput { categoryId?: string | null, severity?: Severity, whereNote?: string | null, comment?: string | null, by: string }

/**
 * Sets the category and severity, and adds a comment. A severity may move either way, except below
 * moderate while first aid or the emergency services are recorded. Each change is logged.
 */
export async function reviewIncident(unit: UnitView, id: string, input: ReviewInput): Promise<void> {
  const r = await row(id)
  if (r.state === 'closed') refuse(NOT_OPEN.code, NOT_OPEN.reason, { remedy: NOT_OPEN.remedy })
  await openForReview(unit, id, input.by)
  const at = nowMs()
  if (input.categoryId !== undefined && input.categoryId !== r.category_id) {
    if (input.categoryId === null) refuse('front-of-house.category-needed', 'An incident keeps its category once given.', { status: 422 })
    unit.add(sql`UPDATE front_of_house_incidents SET category_id = ${input.categoryId}, updated_at = ${at} WHERE id = ${id} AND state <> 'closed' AND ${assertTerm(input.categoryId, CATEGORIES)}`)
      .expect(1, { code: 'front-of-house.unknown-category', reason: 'That is not one of the theatre\'s incident categories.' })
    log(unit, id, { kind: 'category', from: r.category_id, to: input.categoryId, by: input.by })
  }
  if (input.severity && input.severity !== r.severity) {
    if (input.severity === 'minor' && (r.first_aid_given || r.emergency_services_called))
      refuse('front-of-house.severity-floor', 'An incident with first aid or the emergency services is at least moderate.', { status: 422, fields: { severity: 'Moderate or serious.' } })
    unit.add({ sql: 'UPDATE front_of_house_incidents SET severity = ?, updated_at = ? WHERE id = ? AND state <> \'closed\'', params: [input.severity, at, id] })
    log(unit, id, { kind: 'severity', from: r.severity, to: input.severity, by: input.by })
  }
  if (input.whereNote !== undefined && input.whereNote !== r.where_note)
    unit.add({ sql: 'UPDATE front_of_house_incidents SET where_note = ?, updated_at = ? WHERE id = ?', params: [input.whereNote, at, id] })
  if (input.comment) log(unit, id, { kind: 'comment', body: input.comment, by: input.by })
  unit.audit({ action: 'update', record: ['front-of-house.incident', id], detail: { category: input.categoryId !== undefined, severity: input.severity ?? null, comment: !!input.comment } })
}

// ---------------------------------------------------------------------------------------------
// People (FH-29)

export interface PersonInput { accountId?: string | null, name?: string | null, contact?: string | null, involvement: Involvement, isChild?: boolean, details?: string | null }

function needsSomeone(input: PersonInput): void {
  if (!input.accountId && !input.name) refuse('front-of-house.person-unnamed', 'Choose the person\'s account, or give their name.', { status: 422, fields: { name: 'A name, or choose an account.' } })
}

export async function addPerson(unit: UnitView, incidentId: string, input: PersonInput): Promise<string> {
  needsSomeone(input)
  const r = await row(incidentId)
  if (r.state === 'closed') refuse(NOT_OPEN.code, NOT_OPEN.reason, { remedy: NOT_OPEN.remedy })
  const id = newId('inp')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO front_of_house_incident_people (id, incident_id, account_id, name, contact, involvement, is_child, details, created_at, updated_at)
      SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ? FROM front_of_house_incidents WHERE id = ? AND state <> 'closed'`,
    params: [id, input.accountId ?? null, input.accountId ? null : input.name ?? null, input.accountId ? null : input.contact ?? null,
      input.involvement, input.isChild ? 1 : 0, await sealSpecial(input.details ?? null), at, at, incidentId],
  }).expect(1, NOT_OPEN)
  unit.audit({ action: 'create', record: ['front-of-house.incident', incidentId], detail: { person: id, involvement: input.involvement, linked: !!input.accountId } })
  return id
}

export async function updatePerson(unit: UnitView, incidentId: string, personId: string, input: PersonInput): Promise<void> {
  needsSomeone(input)
  const at = nowMs()
  unit.add({
    sql: `UPDATE front_of_house_incident_people SET account_id = ?, name = ?, contact = ?, involvement = ?, is_child = ?, details = ?, updated_at = ?
      WHERE id = ? AND incident_id = ? AND EXISTS (SELECT 1 FROM front_of_house_incidents i WHERE i.id = incident_id AND i.state <> 'closed')`,
    params: [input.accountId ?? null, input.accountId ? null : input.name ?? null, input.accountId ? null : input.contact ?? null, input.involvement, input.isChild ? 1 : 0,
      await sealSpecial(input.details ?? null), at, personId, incidentId],
  }).expect(1, { code: 'front-of-house.incident-closed', reason: 'This person is not on an open incident.' })
  unit.audit({ action: 'update', record: ['front-of-house.incident', incidentId], detail: { person: personId } })
}

export function removePerson(unit: UnitView, incidentId: string, personId: string): void {
  unit.add({
    sql: 'DELETE FROM front_of_house_incident_people WHERE id = ? AND incident_id = ? AND EXISTS (SELECT 1 FROM front_of_house_incidents i WHERE i.id = incident_id AND i.state <> \'closed\')',
    params: [personId, incidentId],
  }).expect(1, { code: 'front-of-house.incident-closed', reason: 'This person is not on an open incident.' })
  unit.audit({ action: 'delete', record: ['front-of-house.incident', incidentId], detail: { person: personId } })
}

// ---------------------------------------------------------------------------------------------
// Actions (FH-29)

export async function addAction(unit: UnitView, incidentId: string, input: { what: string, ownerId?: string | null, dueOn?: string | null }): Promise<string> {
  const id = newId('ina')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO front_of_house_incident_actions (id, incident_id, what, owner_id, due_on, state, created_at, updated_at)
      SELECT ?, id, ?, ?, ?, 'open', ?, ? FROM front_of_house_incidents WHERE id = ? AND state <> 'closed'`,
    params: [id, input.what, input.ownerId ?? null, input.dueOn ?? null, at, at, incidentId],
  }).expect(1, NOT_OPEN)
  unit.audit({ action: 'create', record: ['front-of-house.incident', incidentId], detail: { action: id } })
  return id
}

/** Marks an action done, or dropped with a reason. */
export function resolveAction(unit: UnitView, incidentId: string, actionId: string, input: { state: 'done' | 'dropped', note?: string | null }): void {
  if (input.state === 'dropped' && !input.note) refuse('front-of-house.drop-reason', 'Say why the action is dropped.', { status: 422, fields: { note: 'Why it is no longer needed.' } })
  const at = nowMs()
  unit.add({
    sql: 'UPDATE front_of_house_incident_actions SET state = ?, resolved_at = ?, resolved_note = ?, updated_at = ? WHERE id = ? AND incident_id = ? AND state = \'open\'',
    params: [input.state, at, input.note ?? null, at, actionId, incidentId],
  }).expect(1, { code: 'front-of-house.action-resolved', reason: 'This action is already done or dropped.' })
  unit.audit({ action: 'state', record: ['front-of-house.incident', incidentId], detail: { action: actionId, to: input.state } })
}

// ---------------------------------------------------------------------------------------------
// Closing (FH-30)

/**
 * Closes an incident with a note once every action is done or dropped. A serious incident needs
 * someone other than its reporter. Both rules are guards in the one batch.
 */
export async function closeIncident(unit: UnitView, id: string, input: { note: string, by: string }): Promise<void> {
  const r = await row(id)
  if (r.state === 'closed') refuse('front-of-house.incident-closed', 'This incident is already closed.')
  const at = nowMs()
  unit.add({
    sql: `UPDATE front_of_house_incidents SET updated_at = updated_at WHERE id = ?2 AND NOT (severity = 'serious' AND reported_by IN (${accountScopeSql('?1')}))`,
    params: [input.by, id],
  }).expect(1, { code: 'front-of-house.incident-needs-second-person', reason: 'A serious incident is closed by someone other than the person who reported it.', remedy: 'Ask another reviewer to close it.' })
  unit.add({
    sql: `UPDATE front_of_house_incidents SET state = 'closed', closed_by = ?, closed_at = ?, closing_note = ?, updated_at = ?
      WHERE id = ? AND state <> 'closed' AND NOT EXISTS (SELECT 1 FROM front_of_house_incident_actions a WHERE a.incident_id = ? AND a.state = 'open')`,
    params: [input.by, at, input.note, at, id, id],
  }).expect(1, { code: 'front-of-house.incident-actions-open', reason: 'An action on this incident is still open.', remedy: 'Mark each action done, or drop it with a reason.' })
  log(unit, id, { kind: 'state', from: r.state, to: 'closed', body: input.note, by: input.by })
  unit.announce('front-of-house.incident.closed', { incidentId: id }, { record: ['front-of-house.incident', id] })
  unit.audit({ action: 'state', record: ['front-of-house.incident', id], detail: { from: r.state, to: 'closed' } })
}

/** A manager reopens a closed incident; the reopening is logged. */
export async function reopenIncident(unit: UnitView, id: string, input: { reason: string, by: string }): Promise<void> {
  unit.add({ sql: 'UPDATE front_of_house_incidents SET state = \'in_review\', closed_by = NULL, closed_at = NULL, closing_note = NULL, updated_at = ? WHERE id = ? AND state = \'closed\'', params: [nowMs(), id] })
    .expect(1, { code: 'front-of-house.incident-not-closed', reason: 'This incident is not closed.' })
  log(unit, id, { kind: 'state', from: 'closed', to: 'in_review', body: input.reason, by: input.by })
  unit.audit({ action: 'state', record: ['front-of-house.incident', id], detail: { from: 'closed', to: 'in_review' } })
}

// ---------------------------------------------------------------------------------------------
// The daily run (front-of-house.chase-actions): the digest and action reminders

const DAY = 24 * 60 * 60 * 1000 // not-policy: a day in milliseconds
const WEEK_DAYS = 7 // not-policy: weekly while overdue, fixed by the specification

/** Sends managers one digest of incidents below the immediate severity not yet carried by one. */
export async function sendDigest(unit: UnitView): Promise<number> {
  const waiting = await all<{ id: string, year: number, number: number, kind: IncidentKind, severity: Severity }>(
    'SELECT id, year, number, kind, severity FROM front_of_house_incidents WHERE digested_at IS NULL ORDER BY year, number')
  if (!waiting.length) return 0
  const managers = await holdersOf('front-of-house.incident.manage')
  const at = nowMs()
  if (managers.length) {
    const lines = waiting.map(w => `${reference(w.year, w.number)}: ${kindWords(w.kind)}, ${severityWords(w.severity).toLowerCase()}`).join('\n')
    await notify(unit, 'front-of-house.incident-digest', {
      to: managers,
      variables: { count: String(waiting.length), incidents: lines },
      dedupeKey: `digest:${await localDate(at)}`,
    })
  }
  unit.add({ sql: 'UPDATE front_of_house_incidents SET digested_at = ? WHERE digested_at IS NULL AND id IN (SELECT value FROM json_each(?))', params: [at, JSON.stringify(waiting.map(w => w.id))] })
  return waiting.length
}

/** Reminds owners the day before an action is due, and weekly while it is overdue. */
export async function chaseActions(unit: UnitView): Promise<number> {
  const today = await localDate(nowMs())
  const tomorrow = await localDate(nowMs() + DAY)
  const due = await all<{ id: string, incident_id: string, what: string, owner_id: string, due_on: string, chased_on: string | null, year: number, number: number }>(
    `SELECT a.id, a.incident_id, a.what, a.owner_id, a.due_on, a.chased_on, i.year, i.number FROM front_of_house_incident_actions a
      JOIN front_of_house_incidents i ON i.id = a.incident_id
      WHERE a.state = 'open' AND a.owner_id IS NOT NULL AND a.due_on IS NOT NULL AND a.due_on <= ?`, tomorrow)
  const sent: string[] = []
  for (const a of due) {
    const overdue = a.due_on < today
    const daysSince = a.chased_on ? Math.round((Date.parse(today) - Date.parse(a.chased_on)) / DAY) : Infinity
    const send = a.due_on === tomorrow ? a.chased_on !== today : overdue && daysSince >= WEEK_DAYS
    if (!send) continue
    await notify(unit, overdue ? 'front-of-house.action-overdue' : 'front-of-house.action-due', {
      to: [a.owner_id],
      variables: { what: a.what, incident: reference(a.year, a.number), due: a.due_on },
      dedupeKey: `action:${a.id}:${today}`,
    })
    sent.push(a.id)
  }
  if (sent.length) unit.add({ sql: 'UPDATE front_of_house_incident_actions SET chased_on = ? WHERE id IN (SELECT value FROM json_each(?))', params: [today, JSON.stringify(sent)] })
  return sent.length
}
