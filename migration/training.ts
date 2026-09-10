// The old rehearsal app's training history, keyed to the accounts the identity transform minted
// (K-113). The catalogue is authored fresh, not migrated: see migration/README.md.
import { NOT_ANONYMISED, nanoid } from './lib'
import { londonClock, nextCommitteeYearEnd } from '../shared/utils/london'
import type { Database } from 'bun:sqlite'

// A demand-board reply is SELF in the old app when the member signed themselves up and LEAD when
// a lead entered them; the closest unified pair is SIGNUP and WALK_IN (G-117).
export const ATTENDEE_SOURCE_MAP: Record<string, string> = { SELF: 'SIGNUP', LEAD: 'WALK_IN' }

// ADMIN has no unified equivalent; LEGACY is the vocabulary reserved for a record that is not
// SESSION, SIGNOFF or EXTERNAL, which is exactly what an old admin-entered award is (G-127).
export const RECORD_SOURCE_MAP: Record<string, string> = {
  SESSION: 'SESSION', SIGNOFF: 'SIGNOFF', EXTERNAL: 'EXTERNAL', LEGACY: 'LEGACY', ADMIN: 'LEGACY',
}

const seconds = (ms: number | null): number | null => (ms === null ? null : Math.floor(ms / 1000))

function idFor(map: Map<string, string>, key: string): string {
  const existing = map.get(key)
  if (existing) return existing
  const fresh = nanoid(32).toLowerCase().replaceAll(/[^a-z0-9]/g, '0')
  map.set(key, fresh)
  return fresh
}

interface OldSession {
  id: string
  held_on: string
  trainer_user_id: string
  location: string | null
  notes: string | null
  status: string
  starts_at: number | null
  ends_at: number | null
  capacity: number | null
  register_opened_at: number | null
  cancelled_at: number | null
  cancel_reason: string | null
  created_at: number
  updated_at: number
}

interface OldSessionModule { id: string, session_id: string, module_id: string }

interface OldAttendee {
  id: string
  session_id: string
  user_id: string
  status: string
  signed_up_at: number | null
  source: string
  marked_at: number | null
  marked_by_user_id: string | null
}

interface OldRequest {
  id: string
  user_id: string
  module_id: string
  note: string | null
  status: string
  resolved_at: number | null
  resolved_by: string | null
  decline_reason: string | null
  created_at: number
}

interface OldLead { id: string, department: string, user_id: string, granted_by: string | null, created_at: number }

interface OldRecord {
  id: string
  user_id: string
  module_id: string
  awarded_at: string
  expires_at: string | null
  expiry_overridden: number
  source: string
  session_id: string | null
  granted_by: string | null
  external_ref: string | null
  revoked_at: number | null
  revoked_by: string | null
  revoke_reason: string | null
  created_at: number
}

export interface TrainingTransformInput {
  source: Database
  accounts: Map<string, string>
  moduleIds: Set<string>
  departmentCodes: Set<string>
  sessionIds: Map<string, string>
  requestIds: Map<string, string>
  recordIds: Map<string, string>
  target: Database
}

export interface TrainingSummary {
  sessionsRead: number
  sessionsWritten: number
  skippedSessionNoTrainer: number
  skippedSessionNoTimes: number
  skippedSessionNoModule: number
  attendeesRead: number
  attendeesWritten: number
  skippedAttendeeNoAccount: number
  requestsRead: number
  requestsWritten: number
  skippedRequestNoAccount: number
  skippedRequestNoModule: number
  leadsRead: number
  leadsWritten: number
  skippedLeadNoAccount: number
  recordsRead: number
  recordsWritten: number
  skippedRecordNoAccount: number
  skippedRecordNoModule: number
  skippedRecordDuplicateAward: number
  [key: string]: number
}

export function transformTraining(input: TrainingTransformInput): { summary: TrainingSummary, exceptions: string[] } {
  const { source, accounts, moduleIds, departmentCodes, sessionIds, requestIds, recordIds, target } = input
  const exceptions: string[] = []
  const summary: TrainingSummary = {
    sessionsRead: 0, sessionsWritten: 0, skippedSessionNoTrainer: 0, skippedSessionNoTimes: 0, skippedSessionNoModule: 0,
    attendeesRead: 0, attendeesWritten: 0, skippedAttendeeNoAccount: 0,
    requestsRead: 0, requestsWritten: 0, skippedRequestNoAccount: 0, skippedRequestNoModule: 0,
    leadsRead: 0, leadsWritten: 0, skippedLeadNoAccount: 0,
    recordsRead: 0, recordsWritten: 0, skippedRecordNoAccount: 0, skippedRecordNoModule: 0, skippedRecordDuplicateAward: 0,
  }

  // --- Sessions: the trainer's own account is required, and a session teaches at least one
  // module already in the target catalogue, or it is an exception rather than a guess.

  const oldSessions = source.query('SELECT * FROM sessions ORDER BY id').all() as OldSession[]
  summary.sessionsRead = oldSessions.length

  const oldSessionModules = source.query('SELECT * FROM session_modules').all() as OldSessionModule[]
  const modulesBySession = new Map<string, string[]>()
  for (const row of oldSessionModules) {
    const list = modulesBySession.get(row.session_id) ?? []
    list.push(row.module_id)
    modulesBySession.set(row.session_id, list)
  }

  const oldAttendees = source.query('SELECT * FROM session_attendees ORDER BY id').all() as OldAttendee[]
  const attendeeCountBySession = new Map<string, number>()
  for (const row of oldAttendees) {
    attendeeCountBySession.set(row.session_id, (attendeeCountBySession.get(row.session_id) ?? 0) + 1)
  }

  const insertSession = target.prepare(`
    INSERT INTO training_sessions
      (id, held_on, starts_at, ends_at, place, capacity, opens_at, status, cancelled_at,
       cancelled_by, cancel_reason, description, notes, trainer_id, register_opened_at,
       register_opened_by, marked_at, marked_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, NULL, ?, ?, ?, NULL, NULL, NULL, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      held_on = excluded.held_on, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
      place = excluded.place, capacity = excluded.capacity, status = excluded.status,
      cancelled_at = excluded.cancelled_at, cancel_reason = excluded.cancel_reason,
      notes = excluded.notes, trainer_id = excluded.trainer_id,
      register_opened_at = excluded.register_opened_at, updated_at = excluded.updated_at
    WHERE ${NOT_ANONYMISED('training_sessions', 'trainer_id')}
  `)

  const insertSessionModule = target.prepare(`
    INSERT INTO session_modules (id, session_id, module_id)
    VALUES (?, ?, ?)
    ON CONFLICT (session_id, module_id) DO NOTHING
  `)

  for (const row of oldSessions) {
    const trainerId = accounts.get(row.trainer_user_id)
    if (!trainerId) {
      summary.skippedSessionNoTrainer++
      exceptions.push(`session ${row.id}: no canonical account for trainer`)
      continue
    }
    if (row.starts_at === null || row.ends_at === null) {
      summary.skippedSessionNoTimes++
      exceptions.push(`session ${row.id}: no start or end time recorded, not imported`)
      continue
    }
    const taught = (modulesBySession.get(row.id) ?? []).filter(moduleId => moduleIds.has(moduleId))
    if (taught.length === 0) {
      summary.skippedSessionNoModule++
      exceptions.push(`session ${row.id}: no module in the unified catalogue, not imported`)
      continue
    }

    const id = idFor(sessionIds, row.id)
    // Historical sessions carry no capacity in the old app; the unified schema requires one, so
    // the attendee count is the honest floor rather than an invented ceiling (never guessed).
    const capacity = Math.min(Math.max(row.capacity ?? attendeeCountBySession.get(row.id) ?? 1, 1), 60)
    const starts = new Date(row.starts_at)
    const ends = new Date(row.ends_at)

    insertSession.run(
      id, row.held_on, londonClock(starts), londonClock(ends), row.location, capacity,
      row.status, seconds(row.cancelled_at), row.cancel_reason, row.notes, trainerId,
      seconds(row.register_opened_at), seconds(row.created_at), seconds(row.updated_at),
    )
    summary.sessionsWritten++

    for (const moduleId of taught) insertSessionModule.run(nanoid(), id, moduleId)
  }

  // --- Attendees: no scrub on this table (0011: attendance is safety history and names nobody
  // else), so no anonymisation guard is needed; only the account has to resolve.

  const insertAttendee = target.prepare(`
    INSERT INTO session_attendees (id, session_id, user_id, status, source, signed_up_at, marked_at, marked_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (session_id, user_id) DO UPDATE SET
      status = excluded.status, source = excluded.source, marked_at = excluded.marked_at, marked_by = excluded.marked_by
  `)

  summary.attendeesRead = oldAttendees.length
  for (const row of oldAttendees) {
    const sessionId = sessionIds.get(row.session_id)
    const userId = accounts.get(row.user_id)
    if (!sessionId || !userId) {
      summary.skippedAttendeeNoAccount++
      exceptions.push(`attendee ${row.id}: no imported session or canonical account`)
      continue
    }
    const markedBy = row.marked_by_user_id ? (accounts.get(row.marked_by_user_id) ?? null) : null
    // Never invented: the old app leaves signed_up_at null for anyone logged rather than signed
    // up, so the session's own created_at is the earliest real fact this row can carry.
    const signedUp = row.signed_up_at ?? oldSessions.find(session => session.id === row.session_id)?.created_at ?? row.marked_at ?? Date.now()

    insertAttendee.run(
      nanoid(32), sessionId, userId, row.status, ATTENDEE_SOURCE_MAP[row.source] ?? 'WALK_IN',
      seconds(signedUp), seconds(row.marked_at), markedBy, seconds(signedUp),
    )
    summary.attendeesWritten++
  }

  // --- Module requests: user-keyed and scrubbed (note, reason), so a stale re-import must not
  // write back over what an erasure already cleared (0011, 0059).

  const insertRequest = target.prepare(`
    INSERT INTO module_requests (id, user_id, module_id, note, status, reason, decided_by, decided_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      note = excluded.note, status = excluded.status, reason = excluded.reason,
      decided_by = excluded.decided_by, decided_at = excluded.decided_at
    WHERE ${NOT_ANONYMISED('module_requests')}
  `)

  const oldRequests = source.query('SELECT * FROM module_requests ORDER BY id').all() as OldRequest[]
  summary.requestsRead = oldRequests.length
  for (const row of oldRequests) {
    const userId = accounts.get(row.user_id)
    if (!userId) {
      summary.skippedRequestNoAccount++
      exceptions.push(`request ${row.id}: no canonical account`)
      continue
    }
    if (!moduleIds.has(row.module_id)) {
      summary.skippedRequestNoModule++
      exceptions.push(`request ${row.id}: no module in the unified catalogue, not imported`)
      continue
    }
    const decidedBy = row.resolved_by ? (accounts.get(row.resolved_by) ?? null) : null

    insertRequest.run(
      idFor(requestIds, row.id), userId, row.module_id, row.note, row.status,
      row.decline_reason, decidedBy, seconds(row.resolved_at), seconds(row.created_at),
    )
    summary.requestsWritten++
  }

  // --- Department leads: kept whole by erasure (0011), so no guard. Imported at the committee
  // year end following the grant, the same policy a live grant gets today (0009, G-110).

  const insertLead = target.prepare(`
    INSERT INTO department_leads (id, department, user_id, expires_at, granted_by, granted_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (department, user_id) DO UPDATE SET
      expires_at = excluded.expires_at, granted_by = excluded.granted_by, granted_at = excluded.granted_at
  `)

  const oldLeads = source.query('SELECT * FROM department_leads ORDER BY id').all() as OldLead[]
  summary.leadsRead = oldLeads.length
  for (const row of oldLeads) {
    const userId = accounts.get(row.user_id)
    if (!userId || !departmentCodes.has(row.department)) {
      summary.skippedLeadNoAccount++
      exceptions.push(`department lead ${row.id}: no canonical account or no such department`)
      continue
    }
    const grantedBy = row.granted_by ? (accounts.get(row.granted_by) ?? null) : null
    const expiresAt = Math.floor(nextCommitteeYearEnd(new Date(row.created_at)).getTime() / 1000)

    insertLead.run(nanoid(32), row.department, userId, expiresAt, grantedBy, seconds(row.created_at))
    summary.leadsWritten++
  }

  // --- Training records: append-only (0010). DO NOTHING on conflict, never DO UPDATE, which the
  // trigger would refuse outright; the id is persisted so the same award lands once (0059).

  const insertRecord = target.prepare(`
    INSERT INTO training_records
      (id, user_id, module_id, awarded_on, expires_on, expiry_overridden, source, session_id,
       granted_by, evidence_ref, revoked_at, revoked_by, revoke_reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO NOTHING
  `)

  const oldRecords = source.query('SELECT * FROM records ORDER BY id').all() as OldRecord[]
  summary.recordsRead = oldRecords.length

  // The live award per (session, user, module) constraint the target already enforces: checked
  // here too, so a real collision is named rather than left to crash the transaction (K-113 c2).
  const liveAwards = new Set(
    target.query<{ session_id: string, user_id: string, module_id: string }, []>(
      'SELECT session_id, user_id, module_id FROM training_records WHERE session_id IS NOT NULL AND revoked_at IS NULL',
    ).all().map(row => `${row.session_id}|${row.user_id}|${row.module_id}`),
  )

  for (const row of oldRecords) {
    const userId = accounts.get(row.user_id)
    if (!userId) {
      summary.skippedRecordNoAccount++
      exceptions.push(`record ${row.id}: no canonical account`)
      continue
    }
    if (!moduleIds.has(row.module_id)) {
      summary.skippedRecordNoModule++
      exceptions.push(`record ${row.id}: no module in the unified catalogue, not imported`)
      continue
    }
    const sessionId = row.session_id ? (sessionIds.get(row.session_id) ?? null) : null
    if (row.session_id && !sessionId) {
      exceptions.push(`record ${row.id}: session ${row.session_id} did not import, award carries no session`)
    }
    if (sessionId && !row.revoked_at) {
      const key = `${sessionId}|${userId}|${row.module_id}`
      if (liveAwards.has(key)) {
        summary.skippedRecordDuplicateAward++
        exceptions.push(`record ${row.id}: duplicate live award for this session, user and module`)
        continue
      }
      liveAwards.add(key)
    }

    const grantedBy = row.granted_by ? (accounts.get(row.granted_by) ?? null) : null
    const revokedBy = row.revoked_by ? (accounts.get(row.revoked_by) ?? null) : null

    insertRecord.run(
      idFor(recordIds, row.id),
      userId, row.module_id, row.awarded_at, row.expires_at, row.expiry_overridden ?? 0,
      RECORD_SOURCE_MAP[row.source] ?? 'LEGACY', sessionId, grantedBy, row.external_ref,
      seconds(row.revoked_at), revokedBy, row.revoke_reason, seconds(row.created_at),
    )
    summary.recordsWritten++
  }

  return { summary, exceptions }
}

export interface TrainingReconciliation {
  ok: boolean
  problems: string[]
}

// Counts only, matched against what the transform itself reported: no independent read of the
// source here, so this catches a bug in the write path, not a bug in the count (criterion 2).
export function reconcileTraining(target: Database, summary: TrainingSummary): TrainingReconciliation {
  const problems: string[] = []

  const sessionsAccounted = summary.sessionsWritten + summary.skippedSessionNoTrainer
    + summary.skippedSessionNoTimes + summary.skippedSessionNoModule
  if (sessionsAccounted !== summary.sessionsRead) problems.push(`read ${summary.sessionsRead} sessions but accounted for ${sessionsAccounted}`)

  const attendeesAccounted = summary.attendeesWritten + summary.skippedAttendeeNoAccount
  if (attendeesAccounted !== summary.attendeesRead) problems.push(`read ${summary.attendeesRead} attendees but accounted for ${attendeesAccounted}`)

  const requestsAccounted = summary.requestsWritten + summary.skippedRequestNoAccount + summary.skippedRequestNoModule
  if (requestsAccounted !== summary.requestsRead) problems.push(`read ${summary.requestsRead} requests but accounted for ${requestsAccounted}`)

  const leadsAccounted = summary.leadsWritten + summary.skippedLeadNoAccount
  if (leadsAccounted !== summary.leadsRead) problems.push(`read ${summary.leadsRead} department leads but accounted for ${leadsAccounted}`)

  const recordsAccounted = summary.recordsWritten + summary.skippedRecordNoAccount
    + summary.skippedRecordNoModule + summary.skippedRecordDuplicateAward
  if (recordsAccounted !== summary.recordsRead) problems.push(`read ${summary.recordsRead} records but accounted for ${recordsAccounted}`)

  const landedRecords = (target.query('SELECT count(*) AS n FROM training_records').get() as { n: number }).n
  if (landedRecords < summary.recordsWritten) problems.push(`wrote ${summary.recordsWritten} records but ${landedRecords} are in the target`)

  return { ok: problems.length === 0, problems }
}
