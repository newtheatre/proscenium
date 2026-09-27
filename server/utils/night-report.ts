import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { checklistFor } from './checklist'
import { admittedSeatsSubquery, admittedWalkUpSeatsSubquery, heldSeatsSubquery, noShowSeatsSubquery } from './capacity'
import { cardSalesQuery } from './reconciliation'
import { DOOR_COVER_ACTION, NIGHT_ROLES, OFFICER_BYPASS_ACTION, doorCoverTarget, officerBypassTarget } from '#shared/utils/night-authority'
import { showNightBounds } from '#shared/utils/show-night'
import type { ChecklistEntry } from '#shared/utils/checklist'
import type { OfficerBypassLine } from '#shared/utils/night-authority'
import type { SQL } from 'drizzle-orm'

// The night report compiler (E-123). Every figure derives from the ledger and the registers at
// read time, so a draft read before close and a frozen read after it (E-124) run identically.

export interface ReportAttendance {
  sold: number
  admitted: number
  noShows: number
  walkUps: number
  passAdmissions: number
  // fellowshipAdmissions is passAdmissions' own subset (D-130 criterion 5); its value is always
  // nought, the same reasoning architecture.md gives an ordinary pass admission's own line.
  fellowshipAdmissions: number
}

// Seats admitted on a pass, and the Fellowship's among them, correlated or bound as the capacity
// counts are. Their aliases are their own, so a caller's r, t, a, p or pt can never capture them.
export function passAdmittedSeatsSubquery(performanceId: SQL): SQL {
  return sql`(SELECT count(*) FROM reservations passadm_r
    JOIN tickets passadm_t ON passadm_t.reservation_id = passadm_r.id
    JOIN pass_admissions passadm_a ON passadm_a.ticket_id = passadm_t.id
    WHERE passadm_r.performance_id = ${performanceId} AND passadm_r.status = 'DOOR' AND passadm_t.refunded_at IS NULL)`
}

export function fellowshipAdmittedSeatsSubquery(performanceId: SQL): SQL {
  return sql`(SELECT count(*) FROM reservations fellow_r
    JOIN tickets fellow_t ON fellow_t.reservation_id = fellow_r.id
    JOIN pass_admissions fellow_a ON fellow_a.ticket_id = fellow_t.id
    JOIN passes fellow_p ON fellow_p.id = fellow_a.pass_id
    JOIN pass_types fellow_pt ON fellow_pt.id = fellow_p.pass_type_id
    WHERE fellow_r.performance_id = ${performanceId} AND fellow_r.status = 'DOOR' AND fellow_t.refunded_at IS NULL
      AND fellow_pt.slug = 'fellowship')`
}

// Every figure is seats, as sold is, never bookings, each from the capacity rule's own helpers;
// `passAdmissions` is `admitted`'s subset (D-126).
export function reportAttendanceQuery(performanceId: string): SQL {
  return sql`
    SELECT
      ${heldSeatsSubquery(sql`${performanceId}`)} AS sold,
      ${admittedSeatsSubquery(sql`${performanceId}`)} AS admitted,
      ${noShowSeatsSubquery(sql`${performanceId}`)} AS noShows,
      ${admittedWalkUpSeatsSubquery(sql`${performanceId}`)} AS walkUps,
      ${passAdmittedSeatsSubquery(sql`${performanceId}`)} AS passAdmissions,
      ${fellowshipAdmittedSeatsSubquery(sql`${performanceId}`)} AS fellowshipAdmissions
  `
}

export async function reportAttendance(performanceId: string): Promise<ReportAttendance> {
  const [row] = await db.all<ReportAttendance>(reportAttendanceQuery(performanceId))
  return row ?? { sold: 0, admitted: 0, noShows: 0, walkUps: 0, passAdmissions: 0, fellowshipAdmissions: 0 }
}

export interface TenderTotal { tender: string, totalPence: number }

// A performance's own lines for the desk; the whole show night's for the bar, since a basket
// sells for the night and a matinee-plus-evening leaves performance_id null (F-118, E-127).
type TakingsScope = { performanceId: string } | { night: string }

function scopeWindow(scope: TakingsScope): SQL {
  if ('performanceId' in scope) return sql`ll.performance_id = ${scope.performanceId}`
  const { from, to } = showNightBounds(scope.night)
  const fromAt = Math.floor(from.getTime() / 1000)
  const toAt = Math.floor(to.getTime() / 1000)
  return sql`le.happened_at >= ${fromAt} AND le.happened_at < ${toAt}`
}

// One row per tender actually used; a tender nobody took tonight is simply absent; the caller
// fills zeroes for display rather than this carrying every possible value (criterion 1).
export function reportTakingsQuery(scope: TakingsScope, source: 'DESK' | 'TILL'): SQL {
  return sql`
    SELECT le.tender AS tender, sum(ll.amount_pence) AS totalPence
    FROM ledger_entries le
    JOIN ledger_lines ll ON ll.entry_id = le.id
    WHERE le.source = ${source} AND ${scopeWindow(scope)}
    GROUP BY le.tender
  `
}

// Foregone revenue, never a silent gap (criterion 2): a comp line's own amount is always zero
// (I-102 criterion 4), so what was given away is unit_price_pence, never amount_pence (I-103).
export function reportForegoneQuery(scope: TakingsScope, source: 'DESK' | 'TILL'): SQL {
  return sql`
    SELECT
      coalesce(sum(CASE WHEN le.tender = 'COMP' THEN ll.unit_price_pence * ll.qty ELSE 0 END), 0) AS compsPence,
      coalesce(sum(ll.discount_pence), 0) AS discountsPence
    FROM ledger_entries le
    JOIN ledger_lines ll ON ll.entry_id = le.id
    WHERE le.source = ${source} AND ${scopeWindow(scope)}
  `
}

export interface ReportTakings {
  desk: { tenders: TenderTotal[], compsPence: number, discountsPence: number }
  bar: { tenders: TenderTotal[], compsPence: number, discountsPence: number }
}

async function takingsFor(scope: TakingsScope, source: 'DESK' | 'TILL'): Promise<ReportTakings['desk']> {
  const [tenders, [foregone]] = await Promise.all([
    db.all<TenderTotal>(reportTakingsQuery(scope, source)),
    db.all<{ compsPence: number, discountsPence: number }>(reportForegoneQuery(scope, source)),
  ])
  return { tenders, compsPence: foregone?.compsPence ?? 0, discountsPence: foregone?.discountsPence ?? 0 }
}

export async function reportTakings(performanceId: string, night: string): Promise<ReportTakings> {
  const [desk, bar] = await Promise.all([takingsFor({ performanceId }, 'DESK'), takingsFor({ night }, 'TILL')])
  return { desk, bar }
}

export interface ReportIncident {
  id: string
  category: string
  severity: string
  body: string
  happenedAt: number
  reportedByName: string
  supersedesId: string | null
  supersededBy: string | null
  followUpRequired: boolean
  followUpClosed: boolean
}

// Every incident and near miss against this performance, chain visible (E-115 criterion 3),
// each flagged with its follow-up state whichever way it sits (E-116 criterion 4).
export function reportIncidentsQuery(performanceId: string): SQL {
  return sql`
    SELECT i.id AS id, i.category AS category, i.severity AS severity, i.body AS body,
           i.happened_at AS happenedAt, u.name AS reportedByName, i.supersedes_id AS supersedesId,
           (SELECT id FROM incidents WHERE supersedes_id = i.id) AS supersededBy,
           coalesce(isc.requires_follow_up, 0) AS followUpRequired,
           (ifc.id IS NOT NULL) AS followUpClosed
    FROM incidents i
    JOIN users u ON u.id = i.reported_by
    LEFT JOIN incident_severity_config isc ON isc.severity = i.severity
    LEFT JOIN incident_followup_closures ifc ON ifc.incident_id = i.id
    WHERE i.performance_id = ${performanceId}
    ORDER BY i.happened_at
  `
}

type IncidentRow = Omit<ReportIncident, 'followUpRequired' | 'followUpClosed'> & { followUpRequired: number, followUpClosed: number }

export async function reportIncidents(performanceId: string): Promise<ReportIncident[]> {
  const rows = await db.all<IncidentRow>(reportIncidentsQuery(performanceId))
  return rows.map(row => ({ ...row, followUpRequired: Boolean(row.followUpRequired), followUpClosed: Boolean(row.followUpClosed) }))
}

export interface ReportAgeChecks { accepted: number, refused: number, notRequired: number }

// Current entries only: a superseded outcome is not what actually happened, only the corrected
// row is (E-118 criterion 3). Licensing evidence stays in the register itself; this is a count.
export function reportAgeChecksQuery(performanceId: string): SQL {
  return sql`
    SELECT
      coalesce(sum(CASE WHEN outcome = 'ACCEPTED' THEN 1 ELSE 0 END), 0) AS accepted,
      coalesce(sum(CASE WHEN outcome = 'REFUSED' THEN 1 ELSE 0 END), 0) AS refused,
      coalesce(sum(CASE WHEN outcome = 'NOT_REQUIRED' THEN 1 ELSE 0 END), 0) AS notRequired
    FROM age_checks
    WHERE performance_id = ${performanceId}
      AND id NOT IN (SELECT supersedes_id FROM age_checks WHERE supersedes_id IS NOT NULL)
  `
}

export async function reportAgeChecks(performanceId: string): Promise<ReportAgeChecks> {
  const [row] = await db.all<ReportAgeChecks>(reportAgeChecksQuery(performanceId))
  return row ?? { accepted: 0, refused: 0, notRequired: 0 }
}

export interface ReportMilestone { id: string, label: string, composedAt: number, supersededBy: string | null }

// The board is kept per venue and night (E-120), not per performance, so a matinee day's two
// reports read the same timeline; which call belonged to which house is for the reader to judge.
export function reportMilestonesQuery(venueId: string, night: string): SQL {
  return sql`
    SELECT m.id AS id, mt.label AS label, m.composed_at AS composedAt,
           (SELECT id FROM backstage_messages WHERE supersedes_id = m.id) AS supersededBy
    FROM backstage_messages m
    JOIN backstage_nights n ON n.id = m.night_id
    JOIN backstage_milestone_types mt ON mt.id = m.milestone_type_id
    WHERE n.venue_id = ${venueId} AND n.night = ${night} AND m.milestone_type_id IS NOT NULL
    ORDER BY m.composed_at
  `
}

export async function reportMilestones(venueId: string, night: string): Promise<ReportMilestone[]> {
  return db.all<ReportMilestone>(reportMilestonesQuery(venueId, night))
}

export interface ReportStaffingRow {
  shiftId: string
  role: string
  slot: number
  status: string
  name: string | null
}

// One row per stamped slot: a gap or a decline names nobody and a claim names its claimant for the
// screen to mark (criterion 1).
export function reportStaffingQuery(performanceId: string): SQL {
  return sql`
    SELECT s.id AS shiftId, s.role AS role, s.slot AS slot, s.status AS status,
      CASE WHEN s.status IN ('CONFIRMED', 'CLAIMED') THEN u.name END AS name
    FROM shifts s
    LEFT JOIN users u ON u.id = s.user_id
    WHERE s.performance_id = ${performanceId} AND s.status <> 'CANCELLED'
    ORDER BY s.role, s.slot
  `
}

export async function reportStaffing(performanceId: string): Promise<ReportStaffingRow[]> {
  return db.all<ReportStaffingRow>(reportStaffingQuery(performanceId))
}

// Every role an officer acted in on this performance, read from the targets the guard writes for
// the venue's night, three bound whatever the night holds (E-123 criterion 1, 0098, 0006).
export function reportOfficerBypassesQuery(performanceId: string, venueId: string, night: string): SQL {
  const targets = NIGHT_ROLES.map(role => sql`${officerBypassTarget(night, venueId, role)}`)
  return sql`
    SELECT json_extract(a.detail, '$.role') AS role, u.name AS officerName,
      EXISTS (
        SELECT 1 FROM shifts s
        WHERE s.performance_id = ${performanceId} AND s.status = 'CONFIRMED'
          AND s.role = json_extract(a.detail, '$.role')
      ) AS confirmedShift
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.action = ${OFFICER_BYPASS_ACTION}
      AND a.target IN (${sql.join(targets, sql`, `)})
      AND EXISTS (SELECT 1 FROM json_each(a.detail, '$.performanceIds') pids WHERE pids.value = ${performanceId})
    ORDER BY CASE json_extract(a.detail, '$.role') WHEN 'DUTY_MANAGER' THEN 0 WHEN 'DOOR' THEN 1 ELSE 2 END, u.name
  `
}

export async function reportOfficerBypasses(performanceId: string, venueId: string, night: string): Promise<OfficerBypassLine[]> {
  const rows = await db.all<Omit<OfficerBypassLine, 'confirmedShift'> & { confirmedShift: number }>(
    reportOfficerBypassesQuery(performanceId, venueId, night),
  )
  return rows.map(row => ({ ...row, confirmedShift: Boolean(row.confirmedShift) }))
}

export interface ReportDoorCover { name: string | null }

// Who covered the door from the duty manager's shift on this performance, read from the one target
// the guard writes for the venue's night (0095, E-123 criterion 1). Three parameters (0006).
export function reportDoorCoversQuery(performanceId: string, venueId: string, night: string): SQL {
  return sql`
    SELECT u.name AS name
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.action = ${DOOR_COVER_ACTION} AND a.target = ${doorCoverTarget(night, venueId)}
      AND EXISTS (SELECT 1 FROM json_each(a.detail, '$.performanceIds') pids WHERE pids.value = ${performanceId})
    ORDER BY u.name
  `
}

export async function reportDoorCovers(performanceId: string, venueId: string, night: string): Promise<ReportDoorCover[]> {
  return db.all<ReportDoorCover>(reportDoorCoversQuery(performanceId, venueId, night))
}

export interface ReportBarSummary { revenuePence: number, itemsSold: number }

// Items sold, the one figure `barReconciliation` does not carry (criterion 1 names it
// separately); revenue is F-118's own card-sales figure, so this report and till-close agree.
export function reportBarItemsSoldQuery(night: string): SQL {
  const { from, to } = showNightBounds(night)
  const fromAt = Math.floor(from.getTime() / 1000)
  const toAt = Math.floor(to.getTime() / 1000)
  return sql`
    SELECT coalesce(sum(l.qty), 0) AS itemsSold
    FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
    WHERE e.source = 'TILL' AND l.kind = 'BAR_ITEM' AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}
  `
}

// Never a retyped figure (F-118 criterion 4): revenue is `cardSalesQuery`, the exact query
// till-close reconciles card sales against, not a second one hand-written over the same lines.
export async function reportBarSummary(night: string): Promise<ReportBarSummary> {
  const [[cardSales], [items]] = await Promise.all([
    db.all<{ cardSalesPence: number }>(cardSalesQuery(night)),
    db.all<{ itemsSold: number }>(reportBarItemsSoldQuery(night)),
  ])
  return { revenuePence: cardSales?.cardSalesPence ?? 0, itemsSold: items?.itemsSold ?? 0 }
}

export interface ReportAccess { verified: number }

// Counts only, never a need or an identity (criterion 3): how many tickets on this performance
// belong to a verified access profile, nothing about which need or whose ticket.
export function reportAccessQuery(performanceId: string): SQL {
  return sql`
    SELECT count(DISTINCT r.user_id) AS verified
    FROM reservations r
    JOIN tickets t ON t.reservation_id = r.id AND t.refunded_at IS NULL
    JOIN access_profiles ap ON ap.user_id = r.user_id AND ap.status = 'VERIFIED'
    WHERE r.performance_id = ${performanceId}
  `
}

export async function reportAccess(performanceId: string): Promise<ReportAccess> {
  const [row] = await db.all<ReportAccess>(reportAccessQuery(performanceId))
  return row ?? { verified: 0 }
}

export interface NightReport {
  performanceId: string
  attendance: ReportAttendance
  takings: ReportTakings
  incidents: ReportIncident[]
  ageChecks: ReportAgeChecks
  milestones: ReportMilestone[]
  staffing: ReportStaffingRow[]
  bypasses: OfficerBypassLine[]
  covers: ReportDoorCover[]
  bar: ReportBarSummary
  access: ReportAccess
  checklist: ChecklistEntry[]
}

// The whole report, one call, every section its own query run together (criterion 4: a draft
// before close and a frozen read after E-124 exists run this identically).
export async function compileNightReport(performanceId: string, venueId: string, night: string): Promise<NightReport> {
  const [attendance, takings, incidents, ageChecks, milestones, staffing, bypasses, covers, bar, access, checklist] = await Promise.all([
    reportAttendance(performanceId),
    reportTakings(performanceId, night),
    reportIncidents(performanceId),
    reportAgeChecks(performanceId),
    reportMilestones(venueId, night),
    reportStaffing(performanceId),
    reportOfficerBypasses(performanceId, venueId, night),
    reportDoorCovers(performanceId, venueId, night),
    reportBarSummary(night),
    reportAccess(performanceId),
    // Performance-scoped like every other section here (E-128); an exception's reason now
    // prints here, closing the gap E-114 criterion 5 left open.
    checklistFor(performanceId),
  ])
  return { performanceId, attendance, takings, incidents, ageChecks, milestones, staffing, bypasses, covers, bar, access, checklist }
}
