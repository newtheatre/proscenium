import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { notify } from './notify'
import { PERMISSION_MAP, ROLES } from '#shared/utils/roles'
import type { Category, Severity } from '#shared/utils/incidents'
import type { SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'

// Severity routing to follow-up (E-116). `incident_severity_config` is committee configuration,
// mutable like `checklist_items`; `incident_followup_closures` is append-only like `incidents`.

export interface SeverityConfigRow { severity: string, requiresFollowUp: boolean }

export function severityConfigQuery(): SQL {
  return sql`SELECT severity AS severity, requires_follow_up AS requiresFollowUp FROM incident_severity_config ORDER BY severity`
}

export async function severityConfig(): Promise<SeverityConfigRow[]> {
  const rows = await db.all<{ severity: string, requiresFollowUp: number }>(severityConfigQuery())
  return rows.map(row => ({ severity: row.severity, requiresFollowUp: row.requiresFollowUp === 1 }))
}

// Every row is seeded by migration, one per severity, so this is always an UPDATE: no caller
// ever creates or removes a severity, only flips whether it routes (criterion 1).
export function setSeverityConfigStatement(severity: string, requiresFollowUp: boolean, updatedBy: string): SQL {
  return sql`
    UPDATE incident_severity_config
    SET requires_follow_up = ${requiresFollowUp ? 1 : 0}, updated_by = ${updatedBy}, updated_at = unixepoch()
    WHERE severity = ${severity}
    RETURNING severity
  `
}

export async function requiresFollowUp(severity: string): Promise<boolean> {
  const [row] = await db.all<{ requiresFollowUp: number }>(sql`
    SELECT requires_follow_up AS requiresFollowUp FROM incident_severity_config WHERE severity = ${severity}
  `)
  return row?.requiresFollowUp === 1
}

export interface OpenFollowUp {
  id: string
  performanceId: string
  reportedByName: string
  category: string
  severity: string
  body: string
  happenedAt: number
}

// Every incident at a routed severity with no closure yet: the safety officer's open-items list
// (criterion 2). A superseded entry is judged on its own severity, the same as any other row.
export function openFollowUpsQuery(): SQL {
  return sql`
    SELECT i.id AS id, i.performance_id AS performanceId, u.name AS reportedByName,
           i.category AS category, i.severity AS severity, i.body AS body, i.happened_at AS happenedAt
    FROM incidents i
    JOIN users u ON u.id = i.reported_by
    JOIN incident_severity_config c ON c.severity = i.severity AND c.requires_follow_up = 1
    WHERE NOT EXISTS (SELECT 1 FROM incident_followup_closures f WHERE f.incident_id = i.id)
    ORDER BY i.happened_at DESC
  `
}

export async function openFollowUps(): Promise<OpenFollowUp[]> {
  return db.all<OpenFollowUp>(openFollowUpsQuery())
}

// Predicated on no closure existing yet, decided from RETURNING via auditedWrite() (0049): two
// safety officers closing the same item at once settle to one winner between them.
export function closeFollowUpStatement(incidentId: string, resolutionNote: string, closedBy: string, id: string): SQL {
  return sql`
    INSERT INTO incident_followup_closures (id, incident_id, resolution_note, closed_by)
    SELECT ${id}, ${incidentId}, ${resolutionNote}, ${closedBy}
    WHERE EXISTS (SELECT 1 FROM incidents WHERE id = ${incidentId})
      AND NOT EXISTS (SELECT 1 FROM incident_followup_closures WHERE incident_id = ${incidentId})
    RETURNING id
  `
}

// Whoever holds the safety officer's own standing permission, the same shape `rotaOfficers()`
// uses for the FOH officer's (E-107, E-108).
export async function safetyOfficers(): Promise<{ id: string }[]> {
  const roles = ROLES.filter(role => PERMISSION_MAP[role].includes('safety.write'))
  if (roles.length === 0) return []

  const now = Math.floor(Date.now() / 1000)
  return db.selectDistinct({ id: schema.users.id })
    .from(schema.roleGrants)
    .innerJoin(schema.users, eq(schema.users.id, schema.roleGrants.userId))
    .where(and(
      inArray(schema.roleGrants.role, roles),
      sql`(${schema.roleGrants.expiresAt} IS NULL OR ${schema.roleGrants.expiresAt} > ${now})`,
      eq(schema.users.disabled, false),
    ))
}

// Called after a successful write, never before: a notification for an incident that failed to
// log would be a lie about what happened (criterion 2).
export async function notifySafetyOfficersIfNeeded(
  event: H3Event, incidentId: string, category: Category, severity: Severity,
): Promise<void> {
  if (!(await requiresFollowUp(severity))) return

  const officers = await safetyOfficers()
  await Promise.all(officers.map(officer => notify(event, {
    userId: officer.id,
    type: 'incident.follow-up-required',
    context: { name: '', category, severity },
  })))
}
