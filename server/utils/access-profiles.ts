import { eq, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { AccessProfileMeta, AccessProfilePayload, DeclareAccessProfileInput } from '#shared/utils/access-profile'
import type { Page } from '#shared/utils/pagination'

function encryptionKey(event: H3Event | undefined): string {
  return useRuntimeConfig(event).accessProfileEncryptionKey
}

export interface AccessProfile extends AccessProfileMeta {
  payload: AccessProfilePayload
}

interface StoredRow {
  userId: string
  status: string
  encryptedPayload: string
  consentForhAt: number | null
  verifiedBy: string | null
  verifiedAt: number | null
  expiresAt: number | null
  withdrawnAt: number | null
  createdAt: number
  updatedAt: number
}

async function toProfile(event: H3Event | undefined, row: StoredRow): Promise<AccessProfile> {
  return {
    userId: row.userId,
    status: row.status as AccessProfileMeta['status'],
    consentForhAt: row.consentForhAt,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt,
    expiresAt: row.expiresAt,
    withdrawnAt: row.withdrawnAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    payload: await decryptFromStorage<AccessProfilePayload>(encryptionKey(event), row.encryptedPayload),
  }
}

export async function findAccessProfile(event: H3Event | undefined, userId: string): Promise<AccessProfile | null> {
  const [row] = await db.select().from(schema.accessProfiles).where(eq(schema.accessProfiles.userId, userId)).limit(1)
  if (!row) return null
  return toProfile(event, row as StoredRow)
}

// A patron's own write: content changes always go back to PENDING, because a verified wording is
// only ever agreed against the content that was there when it was agreed (D-127 criterion 2).
export async function declareAccessProfile(event: H3Event, userId: string, input: DeclareAccessProfileInput): Promise<void> {
  const payload: AccessProfilePayload = {
    needs: input.needs,
    companions: input.companions,
    requesterNote: input.requesterNote ?? null,
    accessCardReference: input.accessCardReference ?? null,
    fohNote: null,
  }
  const encryptedPayload = await encryptToStorage(encryptionKey(event), payload)
  const now = Math.floor(Date.now() / 1000)

  await db.batch([
    db.run(sql`
      INSERT INTO access_profiles (user_id, status, encrypted_payload, created_at, updated_at)
      VALUES (${userId}, 'PENDING', ${encryptedPayload}, ${now}, ${now})
      ON CONFLICT (user_id) DO UPDATE SET
        status = 'PENDING',
        encrypted_payload = excluded.encrypted_payload,
        verified_by = NULL,
        verified_at = NULL,
        expires_at = NULL,
        withdrawn_at = NULL,
        updated_at = excluded.updated_at
    `),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${newId()}, ${userId}, 'access-profile.declared', ${`user:${userId}`}, ${JSON.stringify({ companions: input.companions })}
      WHERE changes() = 1
    `),
  ])
}

export async function setAccessProfileConsent(event: H3Event, userId: string, consent: boolean): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await db.batch([
    db.run(sql`
      UPDATE access_profiles SET consent_foh_at = ${consent ? now : null}, updated_at = ${now}
      WHERE user_id = ${userId}
    `),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${newId()}, ${userId}, 'access-profile.consent-changed', ${`user:${userId}`}, ${JSON.stringify({ consent })}
      WHERE changes() = 1
    `),
  ])
}

// A tombstone, not a deletion: the row stays for the withdrawal window so its owner can change
// their mind, and GDPR erasure (server/utils/erasure.ts) bypasses this entirely (D-127 criterion 5).
export async function withdrawAccessProfile(userId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await db.batch([
    db.run(sql`
      UPDATE access_profiles
      SET status = 'WITHDRAWN', withdrawn_at = ${now}, consent_foh_at = NULL, updated_at = ${now}
      WHERE user_id = ${userId} AND status != 'WITHDRAWN'
    `),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${newId()}, ${userId}, 'access-profile.withdrawn', ${`user:${userId}`}, NULL
      WHERE changes() = 1
    `),
  ])
}

export interface QueueRow {
  userId: string
  name: string
  status: string
  createdAt: number
}

// The verification queue: names, because the officer checks a card against a person, and
// nothing else about the declaration (D-127 criterion 2, criterion 4's staff-search exclusion).
export async function accessProfileQueue(status: string, page: number, pageSize: number): Promise<Page<QueueRow>> {
  const where = sql`${schema.accessProfiles.status} = ${status}`
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(schema.accessProfiles).where(where)
  const items = await db.select({
    userId: schema.accessProfiles.userId,
    name: schema.users.name,
    status: schema.accessProfiles.status,
    createdAt: schema.accessProfiles.createdAt,
  })
    .from(schema.accessProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.accessProfiles.userId))
    .where(where)
    .orderBy(schema.accessProfiles.createdAt)
    .limit(pageSize)
    .offset(offsetFor(page, pageSize))

  return envelope(items as QueueRow[], total ?? 0, page, pageSize)
}

export interface VerifyDecision {
  decision: 'VERIFIED' | 'DECLINED'
  fohNote: string | null
  expiresAt: number | null
}

// Only a PENDING profile moves; a withdrawn one cannot be reinstated by an officer, and a
// decision already recorded is not retaken silently (D-127 criteria 2 and 5).
export async function decideAccessProfile(event: H3Event, actorId: string, userId: string, decision: VerifyDecision): Promise<boolean> {
  const current = await findAccessProfile(event, userId)
  if (!current) throw createError({ statusCode: 404, statusMessage: 'No such access profile' })
  if (current.status !== 'PENDING') {
    throw createError({ statusCode: 409, statusMessage: `That profile is already ${current.status.toLowerCase()}` })
  }

  const payload: AccessProfilePayload = {
    ...current.payload,
    fohNote: decision.decision === 'VERIFIED' ? (decision.fohNote ?? null) : null,
  }
  const encryptedPayload = await encryptToStorage(encryptionKey(event), payload)
  const now = Math.floor(Date.now() / 1000)
  const verifiedAt = decision.decision === 'VERIFIED' ? now : null
  const expiresAt = decision.decision === 'VERIFIED' ? decision.expiresAt : null

  const [applied] = await db.batch([
    db.all<{ userId: string }>(sql`
      UPDATE access_profiles
      SET status = ${decision.decision},
          encrypted_payload = ${encryptedPayload},
          verified_by = ${actorId},
          verified_at = ${verifiedAt},
          expires_at = ${expiresAt},
          updated_at = ${now}
      WHERE user_id = ${userId} AND status = 'PENDING'
      RETURNING user_id
    `),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${newId()}, ${actorId},
        ${decision.decision === 'VERIFIED' ? 'access-profile.verified' : 'access-profile.declined'},
        ${`user:${userId}`}, ${JSON.stringify({ expiresAt })}
      WHERE changes() = 1
    `),
  ])

  return applied.length > 0
}

// Run by the daily sweep (nuxt.config.ts `access-profiles:purge-withdrawn`), never by a request:
// a tombstone that outlived its 30 days is deleted outright, no matter who reads it next.
export async function purgeExpiredTombstones(now = Math.floor(Date.now() / 1000)): Promise<number> {
  const cutoff = now - 30 * 24 * 60 * 60
  const removed = await db.all<{ userId: string }>(sql`
    DELETE FROM access_profiles WHERE status = 'WITHDRAWN' AND withdrawn_at <= ${cutoff} RETURNING user_id
  `)
  if (removed.length === 0) return 0

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: null,
    action: 'access-profile.purged',
    target: 'access-profiles:sweep',
    detail: { count: removed.length },
  }))
  return removed.length
}
