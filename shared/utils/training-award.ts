import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

export interface AwardRow {
  id: string
  userId: string
  moduleId: string
  awardedOn: string
  expiresOn: string | null
  expiryOverridden: boolean
  source: 'SIGNOFF' | 'EXTERNAL'
  grantedBy: string | null
  evidenceRef: string | null
}

// One live award per person, module and day, refused on the insert itself so two sign-offs sent
// at once write one record. Returns the row it wrote, or none (0240, 0006).
export function awardOnceStatement(record: AwardRow): SQL {
  return sql`
    insert into training_records
      (id, user_id, module_id, awarded_on, expires_on, expiry_overridden, source, granted_by, evidence_ref)
    select ${record.id}, ${record.userId}, ${record.moduleId}, ${record.awardedOn}, ${record.expiresOn},
      ${record.expiryOverridden ? 1 : 0}, ${record.source}, ${record.grantedBy}, ${record.evidenceRef}
    where not exists (
      select 1 from training_records
      where user_id = ${record.userId} and module_id = ${record.moduleId}
        and awarded_on = ${record.awardedOn} and revoked_at is null)
    returning id
  `
}

// True while the register's attended marks are still `attended`, bound as one list however long
// it is, so a correction computed from an older read applies nothing (0241, 0003).
export function registerAsRead(sessionId: string, attended: string[]): SQL {
  return sql`coalesce((
    select group_concat(user_id, ',') from (
      select user_id from session_attendees
      where session_id = ${sessionId} and status = 'ATTENDED' order by user_id)
  ), '') = ${[...attended].sort().join(',')}`
}
