import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import { formatLondon, fromLondonWallClock, londonParts } from '#shared/utils/london'
import { saysShiftRole } from '#shared/utils/rota'
import type { ShiftRole } from '#shared/utils/rota'
import type { H3Event } from 'h3'

// The seven-day unstaffed digest (E-108). The old app had no chase for a rota gap, so one found
// four days out stayed a gap until somebody happened to look (Prompt Book P6).

export interface UnstaffedRun { performances: number, officers: number, skipped: number }

interface UnstaffedRow {
  showTitle: string
  venueName: string
  startsAt: number
  openRoles: string | null
  dutyManagerGap: number
  shiftCount: number
}

// From now through seven days out. Not a show night: the digest is a planning horizon, not a
// night's boundary, so it reads plain instants rather than `showNightBounds`.
function escalationWindow(at: Date): { from: number, to: number } {
  const from = Math.floor(at.getTime() / 1000)
  return { from, to: from + 7 * 86_400 }
}

// An open shift, an unconfirmed duty manager, or no shifts at all: `shiftCount = 0` catches a
// template-less venue, which stamps no OPEN row for E-101 criterion 4 to be found by.
async function unstaffedPerformances(from: number, to: number): Promise<UnstaffedRow[]> {
  return db.all<UnstaffedRow>(sql`
    SELECT s.title AS showTitle, v.name AS venueName, p.starts_at AS startsAt,
           group_concat(DISTINCT CASE WHEN sh.status = 'OPEN' THEN sh.role END) AS openRoles,
           max(CASE WHEN sh.role = 'DUTY_MANAGER' AND sh.status NOT IN ('CONFIRMED', 'CANCELLED')
                    THEN 1 ELSE 0 END) AS dutyManagerGap,
           count(sh.id) AS shiftCount
    FROM performances p
    JOIN shows s ON s.id = p.show_id
    JOIN venues v ON v.id = p.venue_id
    LEFT JOIN shifts sh ON sh.performance_id = p.id AND sh.status <> 'CANCELLED'
    WHERE p.status <> 'CANCELLED' AND p.starts_at >= ${from} AND p.starts_at < ${to}
    GROUP BY p.id
    HAVING openRoles IS NOT NULL OR dutyManagerGap = 1 OR shiftCount = 0
    ORDER BY p.starts_at
  `)
}

// Whoever administers the rota, the same audience E-101 criterion 2 lets edit a template. There
// is no separate approver role, as C-109's queue reads the same way for rooms (0046).
async function rotaOfficers(): Promise<{ id: string }[]> {
  const roles = ROLES.filter(role => PERMISSION_MAP[role].includes('rota.write'))
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

// Already told today, read from the log rather than a column, matching the room reminder's own
// idempotency: a run retried the same London day sends nothing twice (C-113).
async function alreadyToldToday(userId: string, at: Date): Promise<boolean> {
  const { year, month, day } = londonParts(at)
  const since = Math.floor(fromLondonWallClock(year, month, day).getTime() / 1000)

  const [row] = await db.select({ id: schema.notificationLog.id })
    .from(schema.notificationLog)
    .where(and(
      eq(schema.notificationLog.userId, userId),
      eq(schema.notificationLog.type, 'shift.rota-unstaffed'),
      gte(schema.notificationLog.createdAt, since),
    ))
    .limit(1)

  return row !== undefined
}

// A fully staffed week sends nothing (criterion 3): there is no digest to send, so nothing is
// attempted and nothing is logged, unlike the training expiry digest that reports "all clear".
export async function escalateUnstaffedRota(event: H3Event | undefined, at = new Date()): Promise<UnstaffedRun> {
  const { from, to } = escalationWindow(at)
  const rows = await unstaffedPerformances(from, to)
  if (rows.length === 0) return { performances: 0, officers: 0, skipped: 0 }

  const officers = await rotaOfficers()
  let sent = 0
  let skipped = 0

  for (const officer of officers) {
    if (await alreadyToldToday(officer.id, at)) {
      skipped++
      continue
    }

    await notify(event, {
      type: 'shift.rota-unstaffed',
      userId: officer.id,
      context: {
        name: '',
        performances: rows.map(row => ({
          show: row.showTitle,
          venue: row.venueName,
          when: formatLondon(new Date(row.startsAt * 1000), { dateStyle: 'full' }),
          // A venue with no template stamps nothing at all, which is not an OPEN row to find:
          // criterion says this reads as unstaffed, not as absent (E-101 criterion 4).
          noTemplate: row.shiftCount === 0,
          missingRoles: (row.openRoles ?? '')
            .split(',')
            .filter(Boolean)
            .map(role => saysShiftRole(role as ShiftRole))
            .join(', '),
          dutyManagerGap: row.dutyManagerGap === 1 || row.shiftCount === 0,
        })),
      },
    })
    sent++
  }

  return { performances: rows.length, officers: sent, skipped }
}
