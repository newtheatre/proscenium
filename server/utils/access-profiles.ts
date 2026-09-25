import { db, schema } from '@nuxthub/db'
import { and, eq, lte, sql } from 'drizzle-orm'
import { createError } from 'h3'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { decryptAccessProfilePayload, encryptAccessProfilePayload } from './access-profile-crypto'
import { auditedWrite } from './audit'
import { configValue } from './configuration'
import { tableColumns, whereFrom } from './list-filters'
import { noSuch } from './no-such'
import { auditEntry } from '#shared/utils/audit'
import {
  ACCESS_FLAGS,
  WITHDRAWAL_TOMBSTONE_DAYS,
  asAccessProfileStatus,
  changesDeclaration,
  doorWording,
  effectiveStatus,
  saveRepends,
} from '#shared/utils/access-profiles'
import { accessProfilesList } from '#shared/utils/access-profiles-list'
import { conditionsOf } from '#shared/utils/list-filters'
import type { H3Event } from 'h3'
import type { ListClause } from './list-filters'
import type { ListQuery } from '#shared/utils/list-filters'
import type {
  AccessFlag,
  AccessProfilePayload,
  AccessProfileStatus,
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
    return { flags: emptyFlags(), requesterNote: null, fohNote: null, accessCardNumber: null, declineReason: null }
  }
  const payload = await decryptAccessProfilePayload({ ciphertext: row.encryptedPayload, iv: row.encryptionIv }, userId)
  return { ...payload, declineReason: payload.declineReason ?? null }
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
    declineReason: payload.declineReason ?? null,
  }
}

export async function ownAccessProfile(userId: string, now = Date.now()): Promise<OwnAccessProfile | null> {
  const row = await rowFor(userId)
  if (!row) return null
  return shapeOwn(row, await payloadOf(row, userId), Math.floor(now / 1000))
}

export interface AccessEntitlementProfile {
  status: AccessProfileStatus
  consentFohAt: number | null
  expiresAt: number | null
  companions: number
}

// The columns entitlement needs and nothing else: no payload to decrypt, so this is safe on the
// public booking route's own hot path (D-128 criterion 1).
export async function accessEntitlementProfile(userId: string): Promise<AccessEntitlementProfile | null> {
  const row = await rowFor(userId)
  if (!row) return null
  return { status: asAccessProfileStatus(row.status), consentFohAt: row.consentFohAt, expiresAt: row.expiresAt, companions: row.companions }
}

// What the desk's own scan screen shows for a booking that holds an access or companion ticket:
// the agreed wording, decrypted for exactly this, or nothing at all (D-127 criterion 3).
export async function doorWordingFor(userId: string, now = Date.now()): Promise<string | null> {
  const row = await rowFor(userId)
  if (!row) return null
  const payload = await payloadOf(row, userId)
  return doorWording(
    { status: asAccessProfileStatus(row.status), consentFohAt: row.consentFohAt, expiresAt: row.expiresAt, fohNote: payload.fohNote },
    Math.floor(now / 1000),
  )
}

// Months from now, in whole calendar months: the expiry is an instant, but nobody thinks about
// their next check-in to the day.
function monthsFromNow(now: number, months: number): number {
  const at = new Date(now * 1000)
  at.setUTCMonth(at.getUTCMonth() + months)
  return Math.floor(at.getTime() / 1000)
}

export interface DeclareOutcome { repended: boolean }

// Only the owner calls this, so it is the one reinstatement path from withdrawal (D-127 criterion
// 5). A save that changes nothing leaves a current profile as it is, bar the consent (criterion 7).
export async function declareAccessProfile(event: H3Event, userId: string, input: DeclareAccessProfileInput): Promise<DeclareOutcome> {
  const now = Math.floor(Date.now() / 1000)
  const existing = await rowFor(userId)

  if (existing) {
    const saved = await payloadOf(existing, userId)
    const status = effectiveStatus({ status: asAccessProfileStatus(existing.status), expiresAt: existing.expiresAt }, now)
    if (!saveRepends(status, changesDeclaration({ ...saved, companions: existing.companions }, input))) {
      await setAccessConsent(userId, input.consent)
      return { repended: false }
    }
  }

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
  return { repended: true }
}

// The predicate rides the write, so only a real change lands, and two switches racing to one
// answer leave one trail entry (0003, 0006). Withdrawn is put back by declaring, not by this.
export async function setAccessConsent(userId: string, consent: boolean): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const entry = auditEntry({ actorId: userId, action: 'access-profile.consent.changed', target: `user:${userId}`, detail: { consent } })
  const applied = await auditedWrite(
    db.all<{ userId: string }>(sql`
      UPDATE access_profiles SET consent_foh_at = ${consent ? now : null}, updated_at = ${now}
      WHERE user_id = ${userId} AND status <> 'WITHDRAWN' AND (consent_foh_at IS NULL) = ${consent ? 1 : 0}
      RETURNING user_id AS userId
    `),
    entry,
  )
  if (applied) return

  const row = await rowFor(userId)
  if (!row) throw noSuch('access profile')
  if (row.status === 'WITHDRAWN') {
    throw createError({ statusCode: 409, statusMessage: 'These requirements are withdrawn. Save them again to put them back.' })
  }
}

export interface WithdrawOutcome { withdrawn: boolean, alreadyWithdrawn: boolean }

export async function withdrawAccessProfile(userId: string): Promise<WithdrawOutcome> {
  const existing = await rowFor(userId)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'No access profile to withdraw' })
  const now = Math.floor(Date.now() / 1000)
  const entry = auditEntry({ actorId: userId, action: 'access-profile.withdrawn', target: `user:${userId}` })

  // The predicate rides the write, so two withdrawals racing (a double click, two tabs) leave
  // one audit row rather than two (0003, 0006).
  const applied = await auditedWrite(
    db.all<{ userId: string }>(sql`
      UPDATE access_profiles SET status = 'WITHDRAWN', withdrawn_at = ${now}, consent_foh_at = NULL, updated_at = ${now}
      WHERE user_id = ${userId} AND status <> 'WITHDRAWN'
      RETURNING user_id AS userId
    `),
    entry,
  )

  if (!applied) return { withdrawn: false, alreadyWithdrawn: true }
  return { withdrawn: true, alreadyWithdrawn: false }
}

// The officer's queue, read through its own declaration (K-129): pending is the hidden default
// unless "status" is asked for, "ALL" included, the same shape the register gives "current".
export function accessProfilesClause(query: ListQuery): ListClause {
  const clause = whereFrom(accessProfilesList, query, {
    column: tableColumns(schema.accessProfiles),
    search: [schema.users.name, schema.users.email],
    fields: {
      status: condition => (condition.values[0] === 'ALL' ? undefined : eq(schema.accessProfiles.status, condition.values[0]!)),
    },
  })
  const asked = conditionsOf(accessProfilesList, query).some(condition => condition.key === 'status')
  return asked ? clause : { ...clause, where: and(eq(schema.accessProfiles.status, 'PENDING'), clause.where) }
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
  if (!row) throw noSuch('access profile')
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
  const applied = await auditedWrite(
    db.all<{ userId: string }>(sql`
      UPDATE access_profiles
      SET status = 'VERIFIED', encrypted_payload = ${encrypted.ciphertext}, encryption_iv = ${encrypted.iv},
          verified_by = ${officerId}, verified_at = ${now}, expires_at = ${expiresAt}, updated_at = ${now}
      WHERE user_id = ${userId} AND ${decidablePredicate(now)}
      RETURNING user_id AS userId
    `),
    entry,
  )

  if (!applied) requireDecidable(await rowFor(userId), Math.floor(Date.now() / 1000))
}

// The reason goes into the encrypted payload for the owner to read, never into the trail (0011, 0050).
export async function declineAccessProfile(event: H3Event, userId: string, officerId: string, reason: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const existing = requireDecidable(await rowFor(userId), now)

  const payload = await clearCardNumber(existing, userId)
  payload.declineReason = reason
  const encrypted = await encryptAccessProfilePayload(payload, userId)
  const entry = auditEntry({ actorId: officerId, action: 'access-profile.declined', target: `user:${userId}` })

  const applied = await auditedWrite(
    db.all<{ userId: string }>(sql`
      UPDATE access_profiles
      SET status = 'DECLINED', encrypted_payload = ${encrypted.ciphertext}, encryption_iv = ${encrypted.iv}, updated_at = ${now}
      WHERE user_id = ${userId} AND ${decidablePredicate(now)}
      RETURNING user_id AS userId
    `),
    entry,
  )

  if (!applied) requireDecidable(await rowFor(userId), Math.floor(Date.now() / 1000))
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
