import { and, eq, like, lte, or, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import {
  ACCESS_FLAGS,
  WITHDRAWAL_TOMBSTONE_DAYS,
  asAccessProfileStatus,
  effectiveStatus,
} from '#shared/utils/access-profiles'
import type {
  AccessFlag,
  AccessProfilePayload,
  AccessProfileStatus,
  AccessProfileSummary,
  DeclareAccessProfileInput,
  OfficerAccessProfile,
  OwnAccessProfile,
} from '#shared/utils/access-profiles'

// Declaring, verifying and withdrawing an access profile. The encrypted payload is the only place
// the nine flags, the two notes and the self-declared card number ever live (D-127, 0050).

type AccessProfileRow = typeof schema.accessProfiles.$inferSelect

function emptyFlags(): Record<AccessFlag, boolean> {
  return Object.fromEntries(ACCESS_FLAGS.map(flag => [flag, false])) as Record<AccessFlag, boolean>
}

async function rowFor(userId: string): Promise<AccessProfileRow | undefined> {
  const [row] = await db.select().from(schema.accessProfiles)
    .where(eq(schema.accessProfiles.userId, userId)).limit(1)
  return row
}

async function payloadOf(row: Pick<AccessProfileRow, 'encryptedPayload' | 'encryptionIv'>, userId: string): Promise<AccessProfilePayload> {
  if (!row.encryptedPayload || !row.encryptionIv) {
    return { flags: emptyFlags(), requesterNote: null, fohNote: null, accessCardNumber: null }
  }
  return decryptAccessProfilePayload({ ciphertext: row.encryptedPayload, iv: row.encryptionIv }, userId)
}

function shapeOwn(row: AccessProfileRow, payload: AccessProfilePayload, now: number): OwnAccessProfile {
  return {
    status: effectiveStatus({ status: asAccessProfileStatus(row.status), expiresAt: row.expiresAt }, now),
    flags: payload.flags,
    companions: row.companions,
    requesterNote: payload.requesterNote,
    fohNote: payload.fohNote,
    accessCardNumber: payload.accessCardNumber,
    consentGiven: row.consentFohAt !== null,
    verifiedAt: row.verifiedAt,
    expiresAt: row.expiresAt,
  }
}

export async function ownAccessProfile(userId: string, now = Date.now()): Promise<OwnAccessProfile | null> {
  const row = await rowFor(userId)
  if (!row) return null
  return shapeOwn(row, await payloadOf(row, userId), Math.floor(now / 1000))
}

// Months from now, in whole calendar months: the expiry is an instant, but nobody thinks about
// their next check-in to the day.
function monthsFromNow(now: number, months: number): number {
  const at = new Date(now * 1000)
  at.setUTCMonth(at.getUTCMonth() + months)
  return Math.floor(at.getTime() / 1000)
}

// A declaration always lands PENDING: only the owner can call this, so it is the one sanctioned
// reinstatement path from withdrawal (D-127 criterion 5), and a change to a verified one retires it.
export async function declareAccessProfile(event: H3Event, userId: string, input: DeclareAccessProfileInput): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const existing = await rowFor(userId)

  const payload: AccessProfilePayload = {
    flags: input.flags,
    requesterNote: input.requesterNote ?? null,
    fohNote: null,
    accessCardNumber: input.accessCardNumber ?? null,
  }
  const encrypted = await encryptAccessProfilePayload(payload, userId)

  const values = {
    status: 'PENDING' as const,
    companions: input.companions,
    encryptedPayload: encrypted.ciphertext,
    encryptionIv: encrypted.iv,
    consentFohAt: input.consent ? (existing?.consentFohAt ?? now) : null,
    verifiedBy: null,
    verifiedAt: null,
    expiresAt: null,
    withdrawnAt: null,
    updatedAt: now,
  }

  const write = existing
    ? db.update(schema.accessProfiles).set(values).where(eq(schema.accessProfiles.userId, userId))
    : db.insert(schema.accessProfiles).values({ userId, ...values, createdAt: now })

  await db.batch([
    write,
    db.insert(schema.auditLog).values(auditEntry({
      actorId: userId,
      action: 'access-profile.updated',
      target: `user:${userId}`,
      detail: { wasVerified: existing?.status === 'VERIFIED' },
    })),
  ])
}

export interface WithdrawOutcome { withdrawn: boolean, alreadyWithdrawn: boolean }

export async function withdrawAccessProfile(userId: string): Promise<WithdrawOutcome> {
  const existing = await rowFor(userId)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'No access profile to withdraw' })
  const now = Math.floor(Date.now() / 1000)
  const entry = auditEntry({ actorId: userId, action: 'access-profile.withdrawn', target: `user:${userId}` })

  // The predicate rides the write, so two withdrawals racing (a double click, two tabs) leave
  // one audit row rather than two (0003, 0006).
  const [updated] = await db.batch([
    db.all<{ userId: string }>(sql`
      UPDATE access_profiles SET status = 'WITHDRAWN', withdrawn_at = ${now}, consent_foh_at = NULL, updated_at = ${now}
      WHERE user_id = ${userId} AND status <> 'WITHDRAWN'
      RETURNING user_id AS userId
    `),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, NULL
      WHERE changes() = 1
    `),
  ])

  if (updated.length === 0) return { withdrawn: false, alreadyWithdrawn: true }
  return { withdrawn: true, alreadyWithdrawn: false }
}

// A typed percent sign is a character somebody is looking for, not a wildcard; good enough for an
// internal search box, which is the whole of what this predicate is for.
const contains = (term: string): string => `%${term}%`

function listFilters(status: AccessProfileStatus | undefined, search: string | undefined) {
  const clauses = []
  if (status) clauses.push(eq(schema.accessProfiles.status, status))
  if (search) clauses.push(or(like(schema.users.name, contains(search)), like(schema.users.email, contains(search))))
  return clauses.length ? and(...clauses) : undefined
}

export async function countAccessProfiles(status?: AccessProfileStatus, search?: string): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.accessProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.accessProfiles.userId))
    .where(listFilters(status, search))
  return row?.count ?? 0
}

// A light summary only: the officer opens one declaration to read its flags and notes, so the
// list never carries the encrypted payload at all.
export async function listAccessProfiles(status: AccessProfileStatus | undefined, search: string | undefined, limit: number, offset: number): Promise<AccessProfileSummary[]> {
  const found = await db.select({
    userId: schema.accessProfiles.userId,
    name: schema.users.name,
    email: schema.users.email,
    status: schema.accessProfiles.status,
    companions: schema.accessProfiles.companions,
    createdAt: schema.accessProfiles.createdAt,
    updatedAt: schema.accessProfiles.updatedAt,
  })
    .from(schema.accessProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.accessProfiles.userId))
    .where(listFilters(status, search))
    .orderBy(schema.accessProfiles.createdAt)
    .limit(limit)
    .offset(offset)
  return found.map(row => ({ ...row, status: asAccessProfileStatus(row.status) }))
}

export async function accessProfileForOfficer(userId: string): Promise<OfficerAccessProfile | null> {
  const [account] = await db.select({ name: schema.users.name, email: schema.users.email })
    .from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  const row = await rowFor(userId)
  if (!account || !row) return null

  const now = Math.floor(Date.now() / 1000)
  return { userId, name: account.name, email: account.email, verifiedBy: row.verifiedBy, ...shapeOwn(row, await payloadOf(row, userId), now) }
}

// Evidence is sighted and never stored, whichever way the decision goes (D-127 criterion 1).
async function clearCardNumber(row: AccessProfileRow, userId: string): Promise<AccessProfilePayload> {
  const payload = await payloadOf(row, userId)
  return { ...payload, accessCardNumber: null }
}

// A fresh or lapsed declaration only (D-127 criterion 5). Matched again at the write below, so a
// row decided out from under this request between the read and the write loses cleanly (0003).
const decidablePredicate = (now: number) => sql`(status = 'PENDING' OR (status = 'VERIFIED' AND expires_at IS NOT NULL AND expires_at <= ${now}))`

function requireDecidable(row: AccessProfileRow | undefined, now: number): AccessProfileRow {
  if (!row) throw createError({ statusCode: 404, statusMessage: 'No such access profile' })
  const status = effectiveStatus({ status: asAccessProfileStatus(row.status), expiresAt: row.expiresAt }, now)
  if (status !== 'PENDING' && status !== 'EXPIRED') {
    throw createError({ statusCode: 409, statusMessage: `This declaration is already ${status.toLowerCase()}` })
  }
  return row
}

export async function verifyAccessProfile(event: H3Event, userId: string, officerId: string, fohNote: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const existing = requireDecidable(await rowFor(userId), now)
  const months = await configValue(event, 'ACCESS_PROFILE_VALIDITY_MONTHS')

  const payload = await clearCardNumber(existing, userId)
  payload.fohNote = fohNote
  const encrypted = await encryptAccessProfilePayload(payload, userId)
  const expiresAt = monthsFromNow(now, months)

  const entry = auditEntry({ actorId: officerId, action: 'access-profile.verified', target: `user:${userId}` })

  // The predicate rides the UPDATE, so a patron withdrawing (or a second officer deciding) between
  // the read above and this write loses the race instead of being silently overwritten (0003, 0006).
  const [updated] = await db.batch([
    db.all<{ userId: string }>(sql`
      UPDATE access_profiles
      SET status = 'VERIFIED', encrypted_payload = ${encrypted.ciphertext}, encryption_iv = ${encrypted.iv},
          verified_by = ${officerId}, verified_at = ${now}, expires_at = ${expiresAt}, updated_at = ${now}
      WHERE user_id = ${userId} AND ${decidablePredicate(now)}
      RETURNING user_id AS userId
    `),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, NULL
      WHERE changes() = 1
    `),
  ])

  if (updated.length === 0) requireDecidable(await rowFor(userId), Math.floor(Date.now() / 1000))
}

export async function declineAccessProfile(event: H3Event, userId: string, officerId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const existing = requireDecidable(await rowFor(userId), now)

  const payload = await clearCardNumber(existing, userId)
  const encrypted = await encryptAccessProfilePayload(payload, userId)
  const entry = auditEntry({ actorId: officerId, action: 'access-profile.declined', target: `user:${userId}` })

  const [updated] = await db.batch([
    db.all<{ userId: string }>(sql`
      UPDATE access_profiles
      SET status = 'DECLINED', encrypted_payload = ${encrypted.ciphertext}, encryption_iv = ${encrypted.iv}, updated_at = ${now}
      WHERE user_id = ${userId} AND ${decidablePredicate(now)}
      RETURNING user_id AS userId
    `),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, NULL
      WHERE changes() = 1
    `),
  ])

  if (updated.length === 0) requireDecidable(await rowFor(userId), Math.floor(Date.now() / 1000))
}

// The 30-day tombstone from withdrawal, then gone outright (D-127 criterion 5). One batch per
// row: each purge is independent and a failure on one must not block the rest.
export async function sweepWithdrawnAccessProfiles(now: Date = new Date()): Promise<number> {
  const cutoff = Math.floor(now.getTime() / 1000) - WITHDRAWAL_TOMBSTONE_DAYS * 24 * 60 * 60
  const overdue = await db.select({ userId: schema.accessProfiles.userId })
    .from(schema.accessProfiles)
    .where(and(eq(schema.accessProfiles.status, 'WITHDRAWN'), lte(schema.accessProfiles.withdrawnAt, cutoff)))

  for (const row of overdue) {
    await db.batch([
      db.delete(schema.accessProfiles).where(eq(schema.accessProfiles.userId, row.userId)),
      db.insert(schema.auditLog).values(auditEntry({
        actorId: null,
        action: 'access-profile.tombstone.purged',
        target: `user:${row.userId}`,
      })),
    ])
  }

  return overdue.length
}
