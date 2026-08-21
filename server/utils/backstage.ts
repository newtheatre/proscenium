import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gt } from 'drizzle-orm'
import type { H3Event } from 'h3'

/**
 * The backstage board's access model (ADR-0020). The code is derived, never
 * stored, so a database dump reveals nothing without the secret.
 */

export const BACKSTAGE_COOKIE = 'nnt-backstage'
/** Failed joins across all devices before the code rotates itself. */
export const FAILED_JOIN_THRESHOLD = 10
/** Sessions die at 02:00, or when the night is closed, whichever is first. */
const NIGHT_LENGTH_MS = 26 * 60 * 60 * 1000

function secret(): string {
  const config = useRuntimeConfig()
  const value = config.backstageCodeSecret || (config as { session?: { password?: string } }).session?.password
  if (!value) {
    throw createError({ statusCode: 500, statusMessage: 'Backstage code secret is not configured' })
  }
  return value
}

async function hmac(input: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input)))
}

/**
 * Six digits from the night and the epoch. Bumping the epoch is what makes a
 * reset instant: every derived value changes and every session is stale.
 */
export async function deriveCode(night: string, epoch: number): Promise<string> {
  const bytes = await hmac(`backstage:${night}:${epoch}`)
  let value = 0
  for (let i = 0; i < 4; i++) value = (value << 8 | bytes[i]!) >>> 0
  return String(value % 1_000_000).padStart(6, '0')
}

export async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time compare, so a wrong code leaks nothing by how long it took. */
function sameCode(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * The night's row, created on first sight. Nobody has to remember to enable
 * anything: asking for tonight's code is what creates it.
 */
export async function ensureNight(night: string) {
  const existing = await db.select().from(schema.backstageNights)
    .where(eq(schema.backstageNights.night, night)).get()
  if (existing) return existing

  const [created] = await db.insert(schema.backstageNights).values({
    night,
    expiresAt: new Date(validityStart(night).getTime() + NIGHT_LENGTH_MS),
  }).onConflictDoNothing().returning()

  return created ?? (await db.select().from(schema.backstageNights)
    .where(eq(schema.backstageNights.night, night)).get())!
}

/** Bump the epoch: every joined device is out, and a new code appears. */
export async function resetCode(night: string, userId: string | null) {
  const row = await ensureNight(night)
  const [updated] = await db.update(schema.backstageNights)
    .set({
      epoch: row.epoch + 1,
      failedAttempts: 0,
      lastResetByUserId: userId,
      lastResetAt: new Date(),
    })
    .where(eq(schema.backstageNights.id, row.id))
    .returning()
  return updated!
}

export interface JoinResult {
  token: string
  expiresAt: Date
}

/**
 * Join by code. A wrong one counts towards the threshold that rotates the
 * code, so even a distributed guesser achieves a reset rather than a join.
 */
export async function joinBackstage(night: string, code: string, deviceName: string | null): Promise<JoinResult> {
  const row = await ensureNight(night)
  const now = new Date()

  if (row.closedAt || row.expiresAt <= now) {
    throw createError({ statusCode: 410, statusMessage: 'Tonight is over. Ask for tomorrow\'s code.' })
  }

  const expected = await deriveCode(night, row.epoch)
  if (!sameCode(code.replace(/\s/g, ''), expected)) {
    const attempts = row.failedAttempts + 1
    if (attempts >= FAILED_JOIN_THRESHOLD) await resetCode(night, null)
    else {
      await db.update(schema.backstageNights).set({ failedAttempts: attempts })
        .where(eq(schema.backstageNights.id, row.id))
    }
    throw createError({ statusCode: 401, statusMessage: 'That code is not right. Ask the duty manager.' })
  }

  const token = [...crypto.getRandomValues(new Uint8Array(32))]
    .map(b => b.toString(16).padStart(2, '0')).join('')

  await db.insert(schema.backstageSessions).values({
    nightId: row.id,
    epoch: row.epoch,
    tokenHash: await sha256(token),
    deviceName: deviceName?.trim() || null,
    joinedAt: now,
    lastSeenAt: now,
  })

  // A correct join clears the counter: the threshold is for guessers, not for
  // someone who fat-fingered it twice first.
  await db.update(schema.backstageNights).set({ failedAttempts: 0 })
    .where(eq(schema.backstageNights.id, row.id))

  return { token, expiresAt: row.expiresAt }
}

export interface BackstageSession {
  id: string
  night: string
  nightId: string
  deviceName: string | null
}

/**
 * The guard for every backstage route. Never returns a user: a code session
 * has no identity, and nothing here may reach one (ADR-0020).
 */
export async function requireBackstageSession(event: H3Event): Promise<BackstageSession> {
  const token = getCookie(event, BACKSTAGE_COOKIE)
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Join with tonight\'s code first.' })

  const row = await db.select({
    id: schema.backstageSessions.id,
    epoch: schema.backstageSessions.epoch,
    deviceName: schema.backstageSessions.deviceName,
    nightId: schema.backstageNights.id,
    night: schema.backstageNights.night,
    currentEpoch: schema.backstageNights.epoch,
    expiresAt: schema.backstageNights.expiresAt,
    closedAt: schema.backstageNights.closedAt,
  })
    .from(schema.backstageSessions)
    .innerJoin(schema.backstageNights, eq(schema.backstageSessions.nightId, schema.backstageNights.id))
    .where(eq(schema.backstageSessions.tokenHash, await sha256(token)))
    .get()

  const now = new Date()
  if (!row || row.epoch !== row.currentEpoch || row.closedAt || row.expiresAt <= now) {
    deleteCookie(event, BACKSTAGE_COOKIE)
    throw createError({ statusCode: 401, statusMessage: 'This device is no longer joined. Ask for the code again.' })
  }

  await db.update(schema.backstageSessions).set({ lastSeenAt: now })
    .where(eq(schema.backstageSessions.id, row.id))

  return { id: row.id, night: row.night, nightId: row.nightId, deviceName: row.deviceName }
}

/** Joined devices, for the count the duty manager does against the room. */
export async function listDevices(nightId: string, epoch: number) {
  return db.select({
    id: schema.backstageSessions.id,
    deviceName: schema.backstageSessions.deviceName,
    joinedAt: schema.backstageSessions.joinedAt,
    lastSeenAt: schema.backstageSessions.lastSeenAt,
  })
    .from(schema.backstageSessions)
    .where(and(
      eq(schema.backstageSessions.nightId, nightId),
      eq(schema.backstageSessions.epoch, epoch),
    ))
    .orderBy(asc(schema.backstageSessions.joinedAt))
}

/** Closing the night ends every code session for it (docs/11 §2.2). */
export async function closeBackstageNight(night: string) {
  await db.update(schema.backstageNights).set({ closedAt: new Date() })
    .where(and(
      eq(schema.backstageNights.night, night),
      gt(schema.backstageNights.expiresAt, new Date(0)),
    ))
}
