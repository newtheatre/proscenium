import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { newId } from './accounts'
import { performancesOnNight } from './performances'
import { MAX_FAILED_ATTEMPTS, deriveBoardCode } from '#shared/utils/backstage'
import type { SQL } from 'drizzle-orm'

// The backstage board's join (E-120). Nothing here ever writes or logs the code itself, only
// the epoch and the attempt count that decide it.

export interface NightRow { id: string, epoch: number, failedAttempts: number }

export function ensureNightStatement(venueId: string, night: string, id: string): SQL {
  return sql`
    INSERT INTO backstage_nights (id, venue_id, night) VALUES (${id}, ${venueId}, ${night})
    ON CONFLICT (venue_id, night) DO NOTHING
  `
}

export function nightRowQuery(venueId: string, night: string): SQL {
  return sql`SELECT id AS id, epoch AS epoch, failed_attempts AS failedAttempts FROM backstage_nights WHERE venue_id = ${venueId} AND night = ${night}`
}

// Idempotent: a second caller racing the first finds the row the first one made, never a second.
export async function ensureNight(venueId: string, night: string): Promise<NightRow> {
  await db.run(ensureNightStatement(venueId, night, newId()))
  const [row] = await db.all<NightRow>(nightRowQuery(venueId, night))
  if (!row) throw new Error('backstage_nights row missing immediately after ensuring it')
  return row
}

// One atomic UPDATE: past the threshold, the epoch moves and the counter resets in the same
// statement, so no caller ever reads a rotated epoch next to a stale attempt count (criterion 4).
export function recordFailedAttemptStatement(id: string): SQL {
  return sql`
    UPDATE backstage_nights
    SET failed_attempts = CASE WHEN failed_attempts + 1 >= ${MAX_FAILED_ATTEMPTS} THEN 0 ELSE failed_attempts + 1 END,
        epoch = CASE WHEN failed_attempts + 1 >= ${MAX_FAILED_ATTEMPTS} THEN epoch + 1 ELSE epoch END,
        updated_at = unixepoch()
    WHERE id = ${id}
    RETURNING epoch AS epoch, failed_attempts AS failedAttempts
  `
}

// A correct code is what proves the board is not being blindly brute-forced, so it clears the
// counter the same way a correct password would (never the epoch: that only a rotation moves).
export function recordSuccessStatement(id: string): SQL {
  return sql`UPDATE backstage_nights SET failed_attempts = 0, updated_at = unixepoch() WHERE id = ${id}`
}

export function joinDeviceStatement(nightId: string, label: string, tokenHash: string, epoch: number, id: string): SQL {
  return sql`
    INSERT INTO backstage_devices (id, night_id, label, token_hash, joined_epoch)
    VALUES (${id}, ${nightId}, ${label}, ${tokenHash}, ${epoch})
  `
}

async function hashToken(plaintext: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plaintext))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export interface JoinResult { deviceId: string, token: string, venueId: string, venueName: string }

// Tonight's venues, whichever one the code matches: a crew member types the code alone, so
// nothing here asks them to already know which venue it belongs to (E-120 criterion 1).
async function venuesTonight(night: string): Promise<{ venueId: string, venueName: string }[]> {
  const running = await performancesOnNight(night)
  const seen = new Map<string, string>()
  for (const performance of running) seen.set(performance.venueId, performance.venueName)
  return [...seen].map(([venueId, venueName]) => ({ venueId, venueName }))
}

// Checked against every venue running tonight; a wrong code counts as a failed attempt against
// each of them, since nothing here can tell which one the crew member meant (criterion 4).
export async function attemptJoin(secret: string, night: string, code: string, label: string): Promise<JoinResult | null> {
  const venues = await venuesTonight(night)
  const nights = await Promise.all(venues.map(async venue => ({ venue, row: await ensureNight(venue.venueId, night) })))

  for (const { venue, row } of nights) {
    const expected = await deriveBoardCode(secret, night, venue.venueId, row.epoch)
    if (expected !== code) continue

    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '')
    const deviceId = newId()
    await db.batch([
      db.run(joinDeviceStatement(row.id, label, await hashToken(token), row.epoch, deviceId)),
      db.run(recordSuccessStatement(row.id)),
    ])
    return { deviceId, token, venueId: venue.venueId, venueName: venue.venueName }
  }

  await db.batch(nights.map(({ row }) => db.run(recordFailedAttemptStatement(row.id))) as never)
  return null
}

export interface CurrentCode { code: string, venueId: string, night: string }

export async function currentCode(secret: string, venueId: string, night: string): Promise<CurrentCode> {
  const row = await ensureNight(venueId, night)
  return { code: await deriveBoardCode(secret, night, venueId, row.epoch), venueId, night }
}

export interface DeviceHolder { deviceId: string, venueId: string, night: string, label: string }

// A joined device's own credential, matched by hashing what it presents, the same shape a
// feed token is matched by (C-104).
export async function deviceByToken(token: string): Promise<DeviceHolder | undefined> {
  const [row] = await db.all<DeviceHolder>(sql`
    SELECT d.id AS deviceId, n.venue_id AS venueId, n.night AS night, d.label AS label
    FROM backstage_devices d JOIN backstage_nights n ON n.id = d.night_id
    WHERE d.token_hash = ${await hashToken(token)}
  `)
  return row
}
