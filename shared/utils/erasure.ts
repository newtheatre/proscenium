import { sql } from 'drizzle-orm'
import { PERSONAL_TABLES } from './personal-data'
import type { SQL } from 'drizzle-orm'

// Erasure is anonymisation, never deletion: the row survives so everything referring to it still
// resolves. What each table gets is the registry's decision, never this file's (0011, K-109).

export const TOMBSTONE_NAME = 'Deleted user'
export const tombstoneEmail = (id: string): string => `deleted-${id}@anonymised.invalid`.toLowerCase()

// Redaction is the audit trail's only sanctioned edit, and the trigger allows nothing but detail
// (0010, J-102). A fixed shape makes a retried erasure write the identical row.
const REDACTED = JSON.stringify({ redacted: true })

// Every statement erasure runs, in one list, so the caller commits them together and a failure
// leaves nothing half-done (K-109 criterion 1).
export function erasureStatements(userId: string, now: number): SQL[] {
  const statements: SQL[] = []

  for (const entry of PERSONAL_TABLES) {
    const table = sql.identifier(entry.name)
    const column = sql.identifier(entry.column)

    if (entry.name === 'users') continue

    if (entry.erasure === 'delete') {
      statements.push(sql`delete from ${table} where ${column} = ${userId}`)
      continue
    }

    if (entry.erasure === 'scrub' && entry.scrub?.length) {
      const assignments = sql.join(entry.scrub.map(name => sql`${sql.identifier(name)} = null`), sql`, `)
      statements.push(sql`update ${table} set ${assignments} where ${column} = ${userId}`)
    }
  }

  // The trail keeps who did what and when; only an entry that picked up an identifying value in
  // its detail is rewritten, and it is rewritten to the same thing every time.
  statements.push(sql`
    update audit_log set detail = ${REDACTED}
    where (actor_id = ${userId} or target = ${`user:${userId}`})
      and detail is not null
      and detail != ${REDACTED}
  `)

  // Last, so a failure above leaves no tombstone: the row is the thing every guard reads.
  statements.push(sql`
    update users set
      email = ${tombstoneEmail(userId)},
      name = ${TOMBSTONE_NAME},
      pronouns = null,
      password = null,
      google_sub = null,
      pending_google_email = null,
      student_id = null,
      anonymised_at = ${now},
      session_epoch = session_epoch + 1,
      updated_at = ${now}
    where id = ${userId} and anonymised_at is null
  `)

  return statements
}
