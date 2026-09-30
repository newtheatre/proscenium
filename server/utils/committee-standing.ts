import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING, 0055).
import { holdsLiveGrant } from './roles-register'
import { COMMITTEE_ROLES } from '#shared/utils/roles'
import type { SQL } from 'drizzle-orm'

// A live grant of any post role or `COMMITTEE` on a usable account, never `ADMIN` alone: what "for
// committee members" means where a duty manager shift or a committee-only module is written (0115).
export function holdsCommitteeRole(userId: string | SQL, now: number): SQL {
  return holdsLiveGrant(typeof userId === 'string' ? sql`${userId}` : userId, COMMITTEE_ROLES, now)
}

export async function hasCommitteeRole(userId: string, now = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const [row] = await db.all<{ held: number }>(sql`select ${holdsCommitteeRole(userId, now)} as held`)
  return row?.held === 1
}
