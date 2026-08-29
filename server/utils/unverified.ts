import { and, asc, eq, isNotNull, isNull, lt } from 'drizzle-orm'

export interface ExpirySweep { eligible: number, erased: number, refused: number, cap: number }

// An account that never proved its address expires through the A-125 path, so erasure stays
// anonymisation and the audit trail names the system rather than an officer (0026).
export async function expireUnverifiedAccounts(now: Date = new Date()): Promise<ExpirySweep> {
  const days = await configValue(undefined, 'UNVERIFIED_ACCOUNT_DAYS')
  const cap = await configValue(undefined, 'UNVERIFIED_EXPIRY_CAP')
  const cutoff = Math.floor(now.getTime() / 1000) - days * 24 * 60 * 60

  // A password-less account is a guest or a console creation, never anybody's registration to
  // complete: claiming and its expiry belong to A-116.
  const overdue = and(
    eq(schema.users.verified, false),
    isNull(schema.users.anonymisedAt),
    isNotNull(schema.users.password),
    lt(schema.users.createdAt, cutoff),
  )

  const rows = await db.select({ id: schema.users.id })
    .from(schema.users)
    .where(overdue)
    .orderBy(asc(schema.users.createdAt))
    .limit(cap)

  // Counted rather than thrown: eraseAccount refuses the last administrator, and one refusal
  // must not stop the rest of the run.
  let erased = 0
  let refused = 0
  for (const row of rows) {
    try {
      if ((await eraseAccount(row.id, null)).erased) erased += 1
    }
    catch {
      refused += 1
    }
  }

  return { eligible: rows.length, erased, refused, cap }
}
