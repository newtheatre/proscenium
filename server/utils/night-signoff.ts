import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { newId } from './accounts'
import { auditIfChanged } from './audit'
import { closeStatement, reviewIncidentsStatement } from './checklist'
import { configValueOrUnset } from './configuration'
import { sendRaw } from './notify'
import { holdsLiveGrant } from './roles-register'
import { REVIEWED_AT_SIGN_OFF } from '#shared/utils/night-signoff'
import { withCommitteeStanding } from '#shared/utils/roles'
import type { NightReport } from './night-report'
import type { AuditRow } from '#shared/utils/audit'
import type { NightAuthorityVia } from '#shared/utils/night-authority'
import type { SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'

// Sign-off, freeze and distribution (E-124), and the SYSTEM auto-close beside it (E-125).
// `night_reports` is append-only, one row per performance; a correction is an addendum.

// SYSTEM never carries a shift or an officer bypass, so it is this file's own vocabulary
// rather than a fourth value on `NightAuthorityVia`, which E-111 alone governs.
export type NightReportSignedVia = NightAuthorityVia | 'SYSTEM'

export interface NightReportRow {
  id: string
  performanceId: string
  venueId: string
  night: string
  closingNote: string
  report: NightReport
  // NULL only alongside `signedVia: 'SYSTEM'` (0089's shape check keeps the two together).
  signedBy: string | null
  signedByName: string | null
  signedVia: NightReportSignedVia
  signedAt: number
}

const REPORT_COLUMNS = sql`
  nr.id AS id, nr.performance_id AS performanceId, nr.venue_id AS venueId, nr.night AS night,
  nr.closing_note AS closingNote, nr.report AS report, nr.signed_by AS signedBy, u.name AS signedByName,
  nr.signed_via AS signedVia, nr.signed_at AS signedAt
`

// A left join: a SYSTEM row's `signed_by` is NULL, and an inner join would silently drop it
// from every read (E-125).
export function reportForPerformanceQuery(performanceId: string): SQL {
  return sql`
    SELECT ${REPORT_COLUMNS}
    FROM night_reports nr LEFT JOIN users u ON u.id = nr.signed_by
    WHERE nr.performance_id = ${performanceId}
  `
}

type RawNightReportRow = Omit<NightReportRow, 'report'> & { report: string }

// `report` is snapshotted as JSON text: a raw `db.all` read never applies Drizzle's column-mode
// conversion, only the schema-aware query builder does, so this parses it by hand.
export async function reportForPerformance(performanceId: string): Promise<NightReportRow | null> {
  const [row] = await db.all<RawNightReportRow>(reportForPerformanceQuery(performanceId))
  if (!row) return null
  return { ...row, report: JSON.parse(row.report) as NightReport }
}

export interface NightSignOffInput {
  id: string
  performanceId: string
  venueId: string
  night: string
  closingNote: string
  report: NightReport
  signedBy: string | null
  signedVia: NightReportSignedVia
  // The incidents the signer's report listed; a count that moved since refuses the freeze.
  incidentsSeen?: number
}

// Predicated on no existing row for this performance, `closeStatement`'s own shape (E-114): a
// second sign-off for the same one returns nothing rather than racing the unique index (0006).
export function signOffStatement(input: NightSignOffInput): SQL {
  const seen = input.incidentsSeen === undefined
    ? sql``
    : sql` AND (SELECT count(*) FROM incidents WHERE performance_id = ${input.performanceId}) = ${input.incidentsSeen}`
  return sql`
    INSERT INTO night_reports (id, performance_id, venue_id, night, closing_note, report, signed_by, signed_via)
    SELECT ${input.id}, ${input.performanceId}, ${input.venueId}, ${input.night}, ${input.closingNote},
           ${JSON.stringify(input.report)}, ${input.signedBy}, ${input.signedVia}
    WHERE NOT EXISTS (SELECT 1 FROM night_reports WHERE performance_id = ${input.performanceId})${seen}
    RETURNING id
  `
}

export interface SignOffAndCloseInput extends Omit<NightSignOffInput, 'signedBy' | 'incidentsSeen'> {
  signedBy: string
  incidentsSeen: number
  closeId: string
  signedEntry: AuditRow
  closedEntry: AuditRow
}

// Sign off and close, in batch order (issue 1315): the freeze decides and its entry follows it,
// then the close and the incident reviews, each written only beside the report it froze (0049).
export function signOffAndCloseStatements(input: SignOffAndCloseInput): [SQL, ...SQL[]] {
  return [
    signOffStatement(input),
    auditIfChanged(input.signedEntry),
    closeStatement(input.performanceId, input.signedBy, input.closeId, input.id),
    auditIfChanged(input.closedEntry),
    reviewIncidentsStatement(input.performanceId, input.signedBy, input.id),
  ]
}

// The frozen copy reads the incidents item as the same batch leaves it: reviewed.
export function reviewedAtSignOff(report: NightReport): NightReport {
  return {
    ...report,
    checklist: report.checklist.map(entry => entry.systemCheck === REVIEWED_AT_SIGN_OFF ? { ...entry, done: true } : entry),
  }
}

export interface AddendumRow { id: string, note: string, addedByName: string, addedAt: number }

export function addendaForReportQuery(reportId: string): SQL {
  return sql`
    SELECT a.id AS id, a.note AS note, u.name AS addedByName, a.added_at AS addedAt
    FROM night_report_addenda a JOIN users u ON u.id = a.added_by
    WHERE a.report_id = ${reportId}
    ORDER BY a.added_at
  `
}

export async function addendaForReport(reportId: string): Promise<AddendumRow[]> {
  return db.all<AddendumRow>(addendaForReportQuery(reportId))
}

// Always succeeds: unlike sign-off, more than one correction is allowed (criterion 5 names no limit).
export function addAddendumStatement(input: { id: string, reportId: string, note: string, addedBy: string }): SQL {
  return sql`INSERT INTO night_report_addenda (id, report_id, note, added_by) VALUES (${input.id}, ${input.reportId}, ${input.note}, ${input.addedBy})`
}

function deliveryStatement(input: { id: string, reportId: string, addendumId: string | null, recipient: string, status: 'SENT' | 'FAILED', error: string | null, sentAt: number | null }): SQL {
  return sql`
    INSERT INTO night_report_deliveries (id, report_id, addendum_id, recipient, status, error, sent_at)
    VALUES (${input.id}, ${input.reportId}, ${input.addendumId}, ${input.recipient}, ${input.status}, ${input.error}, ${input.sentAt})
  `
}

// Whoever holds a named role when the report goes, on an account somebody uses: a grant lapsed at
// the year end, or on an account nobody has claimed, sends nothing (E-124 criterion 3, 0009, 0088).
export function reportRoleHoldersQuery(roles: readonly string[], now: number): SQL {
  return sql`
    SELECT u.email AS email FROM users u
    WHERE ${holdsLiveGrant(sql`u.id`, withCommitteeStanding(roles), now)}
    ORDER BY u.email
  `
}

// Ships unset until a workshop confirms it (0019): distribution to the standing roles is then
// simply empty, rather than an unset key blocking the freeze itself.
async function configuredRecipients(event: H3Event | undefined): Promise<string[]> {
  const roles = (await configValueOrUnset(event, 'NIGHT_REPORT_ROLES')) ?? []
  if (!roles.length) return []
  const holders = await db.all<{ email: string }>(reportRoleHoldersQuery(roles, Math.floor(Date.now() / 1000)))
  return holders.map(holder => holder.email)
}

// One best-effort send per recipient, each outcome its own row (criterion 4's "records each
// distribution outcome"). `closerEmail` is null for a SYSTEM auto-close: nobody closed it (E-125).
export async function distributeReport(
  event: H3Event | undefined,
  reportId: string,
  addendumId: string | null,
  closerEmail: string | null,
  message: { subject: string, html: string, text: string },
): Promise<void> {
  const recipients = [...new Set([...(await configuredRecipients(event)), ...(closerEmail ? [closerEmail] : [])])]
  for (const recipient of recipients) {
    const outcome = await sendRaw(event, { to: recipient, ...message })
    await db.run(deliveryStatement({
      id: newId(),
      reportId,
      addendumId,
      recipient,
      status: outcome.ok ? 'SENT' : 'FAILED',
      error: outcome.ok ? null : outcome.error,
      sentAt: outcome.ok ? Math.floor(Date.now() / 1000) : null,
    }))
  }
}

export interface DeliveryRow { id: string, recipient: string, status: 'SENT' | 'FAILED', error: string | null, sentAt: number | null, createdAt: number }

export function deliveriesForReportQuery(reportId: string): SQL {
  return sql`
    SELECT id AS id, recipient AS recipient, status AS status, error AS error, sent_at AS sentAt, created_at AS createdAt
    FROM night_report_deliveries
    WHERE report_id = ${reportId}
    ORDER BY created_at
  `
}

export async function deliveriesForReport(reportId: string): Promise<DeliveryRow[]> {
  return db.all<DeliveryRow>(deliveriesForReportQuery(reportId))
}
