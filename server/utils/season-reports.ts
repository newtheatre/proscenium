import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { heldSeatsSubquery } from './capacity'
import { OFFICER_BYPASS_ACTION } from '#shared/utils/night-authority'
import type { IncidentTrendFilter, IncidentTrendRow, PerformanceReportFilter, PerformanceReportRow } from '#shared/utils/season-reports'
import type { SQL } from 'drizzle-orm'

// E-126: every query scoped by a resolved range, never one bound parameter per row it covers
// (0001, 0003, 0006). `periodBounds` (season-dashboard.ts) is the one place a season resolves.

const EXPORT_LIMIT = 5000

function incidentFilters(filter: IncidentTrendFilter): SQL {
  const terms: SQL[] = []
  if (filter.category) terms.push(sql`i.category = ${filter.category}`)
  if (filter.severity) terms.push(sql`i.severity = ${filter.severity}`)
  if (filter.venueId) terms.push(sql`v.id = ${filter.venueId}`)
  return terms.length ? sql` AND ${sql.join(terms, sql` AND `)}` : sql``
}

// Grouped, never per-incident: a trend is the count for a category, severity and venue, which is
// what criterion 1 asks to be queryable by, not a second copy of the incident log itself.
export function incidentTrendsQuery(fromAt: number, toAt: number, filter: IncidentTrendFilter, limit: number, offset: number): SQL {
  return sql`
    SELECT i.category AS category, i.severity AS severity, v.id AS venueId, v.name AS venueName, count(*) AS count
    FROM incidents i
    JOIN performances p ON p.id = i.performance_id
    JOIN venues v ON v.id = p.venue_id
    WHERE p.starts_at >= ${fromAt} AND p.starts_at < ${toAt}${incidentFilters(filter)}
    GROUP BY i.category, i.severity, v.id
    ORDER BY v.name, i.category, i.severity
    LIMIT ${limit} OFFSET ${offset}
  `
}

export function incidentTrendsCountQuery(fromAt: number, toAt: number, filter: IncidentTrendFilter): SQL {
  return sql`
    SELECT count(*) AS total FROM (
      SELECT 1
      FROM incidents i
      JOIN performances p ON p.id = i.performance_id
      JOIN venues v ON v.id = p.venue_id
      WHERE p.starts_at >= ${fromAt} AND p.starts_at < ${toAt}${incidentFilters(filter)}
      GROUP BY i.category, i.severity, v.id
    )
  `
}

export async function incidentTrends(fromAt: number, toAt: number, filter: IncidentTrendFilter, limit: number, offset: number): Promise<{ items: IncidentTrendRow[], total: number }> {
  const [items, [totalRow]] = await Promise.all([
    db.all<IncidentTrendRow>(incidentTrendsQuery(fromAt, toAt, filter, limit, offset)),
    db.all<{ total: number }>(incidentTrendsCountQuery(fromAt, toAt, filter)),
  ])
  return { items, total: totalRow?.total ?? 0 }
}

// The export shares the same grouping and filters as the paged read, capped rather than paged
// (E-119's own precedent): a season's own category/severity/venue combinations are always few.
export function incidentTrendsExportQuery(fromAt: number, toAt: number, filter: IncidentTrendFilter): SQL {
  return incidentTrendsQuery(fromAt, toAt, filter, EXPORT_LIMIT, 0)
}

export async function incidentTrendsExport(fromAt: number, toAt: number, filter: IncidentTrendFilter): Promise<IncidentTrendRow[]> {
  return db.all<IncidentTrendRow>(incidentTrendsExportQuery(fromAt, toAt, filter))
}

function performanceFilters(filter: PerformanceReportFilter): SQL {
  return filter.venueId ? sql` AND p.venue_id = ${filter.venueId}` : sql``
}

// One row per performance: attendance and staffing read together, since both are the
// performance's own figures (criterion 1's "attendance vs sold" and "staffing gaps" alike).
export function performanceReportsQuery(fromAt: number, toAt: number, filter: PerformanceReportFilter, limit: number, offset: number): SQL {
  return sql`
    SELECT p.id AS performanceId, p.starts_at AS startsAt, v.id AS venueId, v.name AS venueName, s.title AS showTitle,
      ${heldSeatsSubquery(sql`p.id`)} AS sold,
      (SELECT count(*) FROM reservations r WHERE r.performance_id = p.id AND r.status = 'DOOR') AS admitted,
      (SELECT count(*) FROM reservations r WHERE r.performance_id = p.id AND r.status = 'NO_SHOW') AS noShows,
      (SELECT count(*) FROM shifts sh WHERE sh.performance_id = p.id AND sh.status IN ('OPEN', 'DECLINED')) AS unfilledSlots,
      EXISTS (
        SELECT 1 FROM audit_log a, json_each(a.detail, '$.performanceIds') pids
        WHERE a.action = ${OFFICER_BYPASS_ACTION} AND pids.value = p.id
      ) AS officerBypass,
      EXISTS (SELECT 1 FROM night_reports nr WHERE nr.performance_id = p.id AND nr.signed_via = 'SYSTEM') AS autoClosed
    FROM performances p
    JOIN venues v ON v.id = p.venue_id
    JOIN shows s ON s.id = p.show_id
    WHERE p.starts_at >= ${fromAt} AND p.starts_at < ${toAt} AND p.status != 'CANCELLED'${performanceFilters(filter)}
    ORDER BY p.starts_at
    LIMIT ${limit} OFFSET ${offset}
  `
}

export function performanceReportsCountQuery(fromAt: number, toAt: number, filter: PerformanceReportFilter): SQL {
  return sql`
    SELECT count(*) AS total
    FROM performances p
    WHERE p.starts_at >= ${fromAt} AND p.starts_at < ${toAt} AND p.status != 'CANCELLED'${performanceFilters(filter)}
  `
}

type PerformanceReportSqlRow = Omit<PerformanceReportRow, 'officerBypass' | 'autoClosed'> & { officerBypass: number, autoClosed: number }

function readBooleans(row: PerformanceReportSqlRow): PerformanceReportRow {
  return { ...row, officerBypass: Boolean(row.officerBypass), autoClosed: Boolean(row.autoClosed) }
}

export async function performanceReports(fromAt: number, toAt: number, filter: PerformanceReportFilter, limit: number, offset: number): Promise<{ items: PerformanceReportRow[], total: number }> {
  const [rows, [totalRow]] = await Promise.all([
    db.all<PerformanceReportSqlRow>(performanceReportsQuery(fromAt, toAt, filter, limit, offset)),
    db.all<{ total: number }>(performanceReportsCountQuery(fromAt, toAt, filter)),
  ])
  return { items: rows.map(readBooleans), total: totalRow?.total ?? 0 }
}

export function performanceReportsExportQuery(fromAt: number, toAt: number, filter: PerformanceReportFilter): SQL {
  return performanceReportsQuery(fromAt, toAt, filter, EXPORT_LIMIT, 0)
}

export async function performanceReportsExport(fromAt: number, toAt: number, filter: PerformanceReportFilter): Promise<PerformanceReportRow[]> {
  const rows = await db.all<PerformanceReportSqlRow>(performanceReportsExportQuery(fromAt, toAt, filter))
  return rows.map(readBooleans)
}
