import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { firstNameOf } from '#shared/utils/night-hub'
import type { AuditRow } from '#shared/utils/audit'
import type { NightScope } from '#shared/utils/night-authority'
import type { SQL } from 'drizzle-orm'

// Tonight's confirmed duty manager covering the door for their own performance (0095). Named rather
// than taken from Nitro's auto-imports, because `tests/` typechecks this file under Bun.

// Written once per duty manager, night and venue: the "not already written" predicate rides the
// insert itself, so two first acts at once write one row between them (0003).
export function doorCoverStatement(entry: AuditRow): SQL {
  return sql`
    INSERT INTO audit_log (id, actor_id, action, target, detail)
    SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
    WHERE NOT EXISTS (
      SELECT 1 FROM audit_log WHERE action = ${entry.action} AND actor_id = ${entry.actorId} AND target = ${entry.target}
    )
    RETURNING id
  `
}

export async function recordDoorCover(entry: AuditRow): Promise<void> {
  await db.all(doorCoverStatement(entry))
}

// Tonight's confirmed duty manager for the request's own performance or venue, named on a door
// refusal as the person who can open it. Fixed parameters however many shifts the night holds (0006).
export function dutyManagerTonightQuery(from: number, to: number, scope: NightScope): SQL {
  const atVenue = scope.venueId ? sql` AND p.venue_id = ${scope.venueId}` : sql``
  const atPerformance = scope.performanceId ? sql` AND p.id = ${scope.performanceId}` : sql``
  return sql`
    SELECT u.name AS name
    FROM shifts s
    JOIN performances p ON p.id = s.performance_id
    JOIN users u ON u.id = s.user_id
    WHERE s.role = 'DUTY_MANAGER' AND s.status = 'CONFIRMED' AND p.status <> 'CANCELLED'
      AND p.starts_at >= ${from} AND p.starts_at < ${to} AND u.anonymised_at IS NULL${atVenue}${atPerformance}
    ORDER BY p.starts_at
    LIMIT 1
  `
}

export async function dutyManagerTonight(from: number, to: number, scope: NightScope): Promise<string | null> {
  const [row] = await db.all<{ name: string }>(dutyManagerTonightQuery(from, to, scope))
  return firstNameOf(row?.name)
}
