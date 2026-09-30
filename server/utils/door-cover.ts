import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { holdsCommitteeRole } from './committee-standing'
import { firstNameOf } from '#shared/utils/night-hub'
import { showNightBounds } from '#shared/utils/show-night'
import type { AuditRow } from '#shared/utils/audit'
import type { DoorHelp, NightScope } from '#shared/utils/night-authority'
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

// Narrowed to the request's own performance or venue, under whichever alias the caller reads.
function inScope(alias: string, scope: NightScope): SQL {
  const at = sql.raw(alias)
  const atVenue = scope.venueId ? sql` AND ${at}.venue_id = ${scope.venueId}` : sql``
  const atPerformance = scope.performanceId ? sql` AND ${at}.id = ${scope.performanceId}` : sql``
  return sql`${atVenue}${atPerformance}`
}

// Tonight's confirmed duty manager holding a committee role, so one who could open the door (0115),
// and whether the asker works there too: only tonight's own team is told the name (0006).
export function dutyManagerTonightQuery(
  askerId: string,
  from: number,
  to: number,
  scope: NightScope,
  at = Math.floor(Date.now() / 1000),
): SQL {
  return sql`
    SELECT u.name AS name, EXISTS (
      SELECT 1 FROM shifts mine
      JOIN performances mp ON mp.id = mine.performance_id
      WHERE mine.user_id = ${askerId} AND mine.status = 'CONFIRMED' AND mp.status <> 'CANCELLED'
        AND mp.starts_at >= ${from} AND mp.starts_at < ${to}${inScope('mp', scope)}
    ) AS onTeam
    FROM shifts s
    JOIN performances p ON p.id = s.performance_id
    JOIN users u ON u.id = s.user_id
    WHERE s.role = 'DUTY_MANAGER' AND s.status = 'CONFIRMED' AND p.status <> 'CANCELLED'
      AND p.starts_at >= ${from} AND p.starts_at < ${to}
      AND u.disabled = 0 AND u.anonymised_at IS NULL AND ${holdsCommitteeRole(sql`u.id`, at)}${inScope('p', scope)}
    ORDER BY p.starts_at
    LIMIT 1
  `
}

export async function dutyManagerTonight(askerId: string, night: string, scope: NightScope): Promise<DoorHelp | null> {
  const { from, to } = showNightBounds(night)
  const [row] = await db.all<{ name: string, onTeam: number }>(
    dutyManagerTonightQuery(askerId, Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000), scope),
  )
  if (!row) return null
  return { firstName: row.onTeam ? firstNameOf(row.name) : null }
}
