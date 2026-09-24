import { sql } from 'drizzle-orm'
import { entryIfMade, madeAccount, shadowAccountInsert } from './pending-grants'
import type { AuditRow } from './audit'
import type { SQL } from 'drizzle-orm'

// A sign-off or certificate for an address nobody holds (G-130, 0091). The record is keyed to the
// shadow account written in the same batch, so user_id is never null and never moved afterwards.

export interface RecordByAddress {
  userId: string
  // Normalised by the caller: the CHECK on users refuses anything not lowercased.
  email: string
  name: string
  actorId: string
  record: {
    id: string
    moduleId: string
    awardedOn: string
    expiresOn: string | null
    expiryOverridden: boolean
    source: 'SIGNOFF' | 'EXTERNAL'
    evidenceRef: string | null
  }
  // The account's entry first, then the record's, each written only if the account was.
  entries: AuditRow[]
}

export function recordByAddressStatements(input: RecordByAddress): SQL[] {
  const made = madeAccount(input.userId)
  const { record } = input
  return [
    shadowAccountInsert(input.userId, input.email, input.name),
    sql`insert into training_records (id, user_id, module_id, awarded_on, expires_on, expiry_overridden, source, granted_by, evidence_ref)
      select ${record.id}, ${input.userId}, ${record.moduleId}, ${record.awardedOn}, ${record.expiresOn},
        ${record.expiryOverridden ? 1 : 0}, ${record.source}, ${input.actorId}, ${record.evidenceRef}
      where exists ${made}`,
    ...input.entries.map(row => entryIfMade(row, made)),
  ]
}
