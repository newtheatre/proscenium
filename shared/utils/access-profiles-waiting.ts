import { sql } from 'drizzle-orm'
import { PERMISSION_MAP, ROLES } from './roles'
import type { SQL } from 'drizzle-orm'

export function declarationsWaitingClaimFor(userId: string, day: string): string {
  return `access-profiles.waiting:${userId}:${day}`
}

// How many declarations wait and since when; an erased person's is nobody's to verify.
export function waitingDeclarationsStatement(): SQL {
  return sql`select count(*) as waiting, min(p.updated_at) as oldest
    from access_profiles p join users u on u.id = p.user_id
    where p.status = 'PENDING' and u.anonymised_at is null`
}

// Everybody who can verify one: a live access.verify grant on a reachable account. The role list
// is the permission map's, a constant, never a list read from rows (0006).
export function declarationsVerifiersStatement(now: number): SQL {
  const roles = ROLES.filter(role => PERMISSION_MAP[role].includes('access.verify'))
  return sql`select distinct u.id as id from role_grants g join users u on u.id = g.user_id
    where g.role in (${sql.join(roles.map(role => sql`${role}`), sql`, `)})
      and (g.expires_at is null or g.expires_at > ${now})
      and u.anonymised_at is null and u.disabled = 0 and u.verified = 1
    order by u.id`
}
