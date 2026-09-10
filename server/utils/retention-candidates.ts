import { db, schema } from '@nuxthub/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING, 0055).
import { currentMembership, holdsLiveRole } from './directory'
import { configValue } from './configuration'
import { daysUntilRetentionThreshold, isRetentionGuest } from '#shared/utils/retention'
import type { H3Event } from 'h3'
import type { SQL } from 'drizzle-orm'

// Split out of retention.ts so a caller wanting only "who is due" never pulls that file's
// `useRuntimeConfig` usage into the Bun graph behind it (0057).

export interface CandidateRow {
  id: string
  verified: boolean
  password: string | null
  googleSub: string | null
  lastLoginAt: number | null
  createdAt: number
}

// A tab charge with nothing settling it yet, by reference: append-only `ledger_entries` (0016)
// cannot mark itself settled, so `tab_settled_at`/`tab_settlement_entry_id` stay unwritten (F-109).
const unsettledMoney = (): SQL => sql`exists (
  select 1 from ledger_entries e
  where e.tab_debtor_id = ${schema.users.id} and e.tender = 'TAB'
    and not exists (select 1 from ledger_lines l where l.settles_entry_id = e.id)
)`

export async function candidates(event: H3Event | undefined, now: number): Promise<CandidateRow[]> {
  return db.select({
    id: schema.users.id,
    verified: schema.users.verified,
    password: schema.users.password,
    googleSub: schema.users.googleSub,
    lastLoginAt: schema.users.lastLoginAt,
    createdAt: schema.users.createdAt,
  })
    .from(schema.users)
    .where(and(
      isNull(schema.users.anonymisedAt),
      sql`not ${currentMembership(await configValue(event, 'MEMBERSHIP_GRACE_DAYS'))}`,
      sql`not ${holdsLiveRole(now)}`,
      sql`not ${unsettledMoney()}`,
    ))
}

// The same candidate predicate and threshold `sweepRetention` uses, with no side effect at all:
// a live preview before RETENTION_ARMED is saved reads this, never the real sweep (J-105 criterion 1).
export async function dueForAnonymisation(event: H3Event | undefined, at: Date = new Date()): Promise<number> {
  const fullYears = await configValue(event, 'RETENTION_FULL_ACCOUNT_YEARS')
  const guestYears = await configValue(event, 'RETENTION_GUEST_YEARS')
  const now = Math.floor(at.getTime() / 1000)

  let due = 0
  for (const row of await candidates(event, now)) {
    const years = isRetentionGuest(row) ? guestYears : fullYears
    if (daysUntilRetentionThreshold(row.lastLoginAt ?? row.createdAt, years, now) <= 0) due++
  }
  return due
}

// What the arming route checks before RETENTION_ARMED may turn on (J-105 criterion 4): reviewing
// a digest is nobody's to verify in code, but one having existed to review is.
export async function hasSentRetentionDigest(): Promise<boolean> {
  const [row] = await db.select({ id: schema.notificationLog.id })
    .from(schema.notificationLog)
    .where(and(eq(schema.notificationLog.type, 'retention.digest'), eq(schema.notificationLog.status, 'SENT')))
    .limit(1)
  return row !== undefined
}
