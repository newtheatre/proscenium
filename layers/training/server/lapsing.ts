// Telling people their training is running out (second-round part 3, L3; V6). Nothing here decides
// anything: a verdict reads the dates. Each warning, lapse and cut short is told once, through a
// marker column written on the statement's predicate, so a task run twice tells nobody twice.
import { all, first, nowMs, useSetting, type UnitView } from '#kit'
import { notify } from '#modules/core'
import { dayInWords, theatreDay } from './days'

const SECOND = 1000 // not-policy: settings are whole seconds
const PAGE = 100 // not-policy: how many holders one run of the job tells

interface Due { id: string, accountId: string, courseId: string, course: string, expiresAt: number }
const DUE = `SELECT r.id, r.account_id AS accountId, r.course_id AS courseId, c.title AS course, r.expires_at AS expiresAt
  FROM training_records r JOIN training_courses c ON c.id = r.course_id`

/** Awarded records whose warning period has begun and that have not been warned (L3). */
export async function dueWarnings(): Promise<Due[]> {
  const at = nowMs()
  const before = await useSetting('training.records.warn-before') as number * SECOND
  return all<Due>(`${DUE} WHERE r.status = 'awarded' AND r.warned_at IS NULL AND r.expires_at IS NOT NULL AND r.expires_at > ?1 AND r.expires_at - ?2 <= ?1 ORDER BY r.expires_at LIMIT ?3`, at, before, PAGE) // not-policy: bound parameters
}

/** Awarded records past their date whose lapse has not been announced (L3). */
export async function dueLapses(): Promise<Due[]> {
  return all<Due>(`${DUE} WHERE r.status = 'awarded' AND r.lapse_announced_at IS NULL AND r.expires_at IS NOT NULL AND r.expires_at <= ? ORDER BY r.expires_at LIMIT ?`, nowMs(), PAGE)
}

export async function warnExpiring(unit: UnitView, due: Due): Promise<void> {
  unit.add({ sql: 'UPDATE training_records SET warned_at = ?, updated_at = ? WHERE id = ? AND warned_at IS NULL AND status = \'awarded\'', params: [nowMs(), nowMs(), due.id] })
    .expect(1, { code: 'training.record.warned', reason: 'This training record was warned about a moment ago.' })
  unit.announce('training.record.expiring', { recordId: due.id, accountId: due.accountId, courseId: due.courseId, expiresAt: due.expiresAt }, { record: ['training.record', due.id] })
  await notify(unit, 'training.record-expiring', { to: due.accountId, variables: { course: due.course, until: dayInWords(await theatreDay(due.expiresAt)) }, dedupeKey: `expiring:${due.id}`, subject: ['training.record', due.id] })
}

export async function announceLapse(unit: UnitView, due: Due): Promise<void> {
  unit.add({ sql: 'UPDATE training_records SET lapse_announced_at = ?, updated_at = ? WHERE id = ? AND lapse_announced_at IS NULL AND status = \'awarded\'', params: [nowMs(), nowMs(), due.id] })
    .expect(1, { code: 'training.record.lapse-announced', reason: 'This lapse was announced a moment ago.' })
  unit.announce('training.record.lapsed', { recordId: due.id, accountId: due.accountId, courseId: due.courseId }, { record: ['training.record', due.id] })
  await notify(unit, 'training.record-lapsed', { to: due.accountId, variables: { course: due.course }, dedupeKey: `lapsed:${due.id}`, subject: ['training.record', due.id] })
}

/**
 * Tells one page of the holders a retraining version cut short (V6), after `after` in id order, and
 * gives the last id told when more may remain. The notice's dedupe key keeps a retried page quiet.
 */
export async function tellCutShort(unit: UnitView, input: { courseId: string, versionId: string, after: string | null }): Promise<string | null> {
  const course = await first<{ title: string }>('SELECT title FROM training_courses WHERE id = ?', input.courseId)
  const [version] = await all<{ cutTo: number | null }>('SELECT cut_to AS cutTo FROM training_course_versions WHERE id = ?', input.versionId)
  if (!course || !version?.cutTo) return null
  const rows = await all<{ id: string, accountId: string, expiresAt: number }>(
    `SELECT id, account_id AS accountId, expires_at AS expiresAt FROM training_records WHERE course_id = ?1 AND status = 'awarded' AND cut_reason = 'material-changed'
       AND expires_at = ?2 AND (?3 IS NULL OR id > ?3) ORDER BY id LIMIT ?4`, // not-policy: bound parameters
    input.courseId, version.cutTo, input.after, PAGE,
  )
  if (!rows.length) return null
  const until = dayInWords(await theatreDay(version.cutTo))
  for (const r of rows) unit.announce('training.record.cut-short', { recordId: r.id, accountId: r.accountId, courseId: input.courseId, expiresAt: r.expiresAt }, { record: ['training.record', r.id] })
  await notify(unit, 'training.record-cut-short', { to: rows.map(r => ({ accountId: r.accountId, dedupeKey: `cut-short:${input.versionId}:${r.id}` })), variables: { course: course.title, until }, subject: ['training.course', input.courseId] })
  return rows.length < PAGE ? null : rows.at(-1)!.id
}
