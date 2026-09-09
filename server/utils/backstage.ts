import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { createError, getCookie } from 'h3'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { newId } from './accounts'
import { performancesOnNight } from './performances'
import { MAX_FAILED_ATTEMPTS, MESSAGE_RETENTION_DAYS, deriveBoardCode } from '#shared/utils/backstage'
import { PERMISSION_MAP, ROLES } from '#shared/utils/roles'
import type { SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'

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

export interface DeviceHolder { deviceId: string, nightId: string, venueId: string, night: string, label: string, revokedAt: number | null }

// A joined device's own credential, matched by hashing what it presents, the same shape a
// feed token is matched by (C-104).
export async function deviceByToken(token: string): Promise<DeviceHolder | undefined> {
  const [row] = await db.all<DeviceHolder>(sql`
    SELECT d.id AS deviceId, n.id AS nightId, n.venue_id AS venueId, n.night AS night, d.label AS label, d.revoked_at AS revokedAt
    FROM backstage_devices d JOIN backstage_nights n ON n.id = d.night_id
    WHERE d.token_hash = ${await hashToken(token)}
  `)
  return row
}

export const DEVICE_TOKEN_COOKIE = 'nnt-backstage-token'

// The board's own credential: no session, so a device proves itself with the cookie it was
// handed on joining, refused the moment a reset has revoked it (E-121, E-122 criterion 1).
export async function requireDevice(event: H3Event): Promise<DeviceHolder> {
  const token = getCookie(event, DEVICE_TOKEN_COOKIE)
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Join the board first' })

  const device = await deviceByToken(token)
  if (!device) throw createError({ statusCode: 401, statusMessage: 'That device is not recognised' })
  if (device.revokedAt !== null) throw createError({ statusCode: 401, statusMessage: 'The board was reset: join again with the new code' })

  return device
}

// Every non-revoked device on tonight's board at this venue, so a message poster's presence
// list and a reset's own count both read the same roster.
export function activeDevicesQuery(nightId: string): SQL {
  return sql`SELECT id AS deviceId, label AS label FROM backstage_devices WHERE night_id = ${nightId} AND revoked_at IS NULL`
}

export async function activeDevices(nightId: string): Promise<{ deviceId: string, label: string }[]> {
  return db.all(activeDevicesQuery(nightId))
}

// A reset: every currently-connected device is revoked in the same batch the epoch moves in,
// so nothing observes a moved epoch next to a still-valid device (E-122 criterion 1).
export function revokeDevicesStatement(nightId: string): SQL {
  return sql`UPDATE backstage_devices SET revoked_at = unixepoch() WHERE night_id = ${nightId} AND revoked_at IS NULL`
}

export function resetNightStatement(nightId: string): SQL {
  return sql`UPDATE backstage_nights SET epoch = epoch + 1, failed_attempts = 0, updated_at = unixepoch() WHERE id = ${nightId}`
}

export async function venueName(venueId: string): Promise<string | undefined> {
  const [row] = await db.all<{ name: string }>(sql`SELECT name AS name FROM venues WHERE id = ${venueId}`)
  return row?.name
}

// Told a reset happened, never the new code, which travels by voice only (E-122 criterion 2).
// The same live-role-grant shape `safetyOfficers()` uses: whoever stands to administer tonight.
export async function boardResetRecipients(): Promise<{ id: string }[]> {
  const roles = ROLES.filter(role => PERMISSION_MAP[role].includes('night.manage'))
  if (roles.length === 0) return []

  const now = Math.floor(Date.now() / 1000)
  return db.selectDistinct({ id: schema.users.id })
    .from(schema.roleGrants)
    .innerJoin(schema.users, eq(schema.users.id, schema.roleGrants.userId))
    .where(and(
      inArray(schema.roleGrants.role, roles),
      sql`(${schema.roleGrants.expiresAt} IS NULL OR ${schema.roleGrants.expiresAt} > ${now})`,
      eq(schema.users.disabled, false),
    ))
}

const MESSAGE_COLUMNS = sql`
  m.id AS id, m.night_id AS nightId, m.device_id AS deviceId, d.label AS posterLabel,
  m.milestone_type_id AS milestoneTypeId, mt.label AS milestoneLabel, m.body AS body,
  m.supersedes_id AS supersedesId, m.composed_at AS composedAt, m.created_at AS createdAt
`

export interface MessageRow {
  id: string
  nightId: string
  deviceId: string
  posterLabel: string
  milestoneTypeId: string | null
  milestoneLabel: string | null
  body: string
  supersedesId: string | null
  composedAt: number
  createdAt: number
}

// Every message on tonight's board at this venue, newest first; a poll re-fetches the lot,
// since one night's board is never large enough to page (criterion 3).
export function messagesForNightQuery(nightId: string): SQL {
  return sql`
    SELECT ${MESSAGE_COLUMNS}
    FROM backstage_messages m
    JOIN backstage_devices d ON d.id = m.device_id
    LEFT JOIN backstage_milestone_types mt ON mt.id = m.milestone_type_id
    WHERE m.night_id = ${nightId}
    ORDER BY m.composed_at DESC, m.created_at DESC
  `
}

export async function messagesForNight(nightId: string): Promise<MessageRow[]> {
  return db.all(messagesForNightQuery(nightId))
}

export function postMessageStatement(
  nightId: string, deviceId: string, milestoneTypeId: string | null, body: string, composedAt: number, id: string,
): SQL {
  return sql`
    INSERT INTO backstage_messages (id, night_id, device_id, milestone_type_id, body, composed_at)
    VALUES (${id}, ${nightId}, ${deviceId}, ${milestoneTypeId}, ${body}, ${composedAt})
    RETURNING id
  `
}

// Only a milestone message is ever superseded (criterion 5); the predicate refuses a caller
// trying it against free text or a preset, or against one already corrected.
export function supersedeMessageStatement(
  nightId: string, entryId: string, deviceId: string, milestoneTypeId: string, body: string, composedAt: number, id: string,
): SQL {
  return sql`
    INSERT INTO backstage_messages (id, night_id, device_id, milestone_type_id, body, supersedes_id, composed_at)
    SELECT ${id}, ${nightId}, ${deviceId}, ${milestoneTypeId}, ${body}, ${entryId}, ${composedAt}
    WHERE EXISTS (SELECT 1 FROM backstage_messages WHERE id = ${entryId} AND night_id = ${nightId} AND milestone_type_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM backstage_messages WHERE supersedes_id = ${entryId})
    RETURNING id
  `
}

const ACK_COLUMNS = sql`a.message_id AS messageId, a.device_id AS deviceId, a.acknowledged_at AS acknowledgedAt`

export function acknowledgementsForNightQuery(nightId: string): SQL {
  return sql`
    SELECT ${ACK_COLUMNS}
    FROM backstage_acknowledgements a
    JOIN backstage_messages m ON m.id = a.message_id
    WHERE m.night_id = ${nightId}
  `
}

export interface AcknowledgementRow { messageId: string, deviceId: string, acknowledgedAt: number }

export async function acknowledgementsForNight(nightId: string): Promise<AcknowledgementRow[]> {
  return db.all(acknowledgementsForNightQuery(nightId))
}

export function acknowledgeStatement(messageId: string, deviceId: string, id: string): SQL {
  return sql`
    INSERT INTO backstage_acknowledgements (id, message_id, device_id)
    VALUES (${id}, ${messageId}, ${deviceId})
    ON CONFLICT (message_id, device_id) DO NOTHING
    RETURNING id
  `
}

// The committee's own milestone types and presets (criteria 1, 2), mutable like
// `checklist_items`: a message snapshots the label, so editing one changes nothing already sent.

export interface MilestoneTypeRow { id: string, label: string, sort: number, active: boolean, updatedAt: number }

export function milestoneTypesQuery(includeRetired: boolean): SQL {
  const predicate = includeRetired ? sql`` : sql` WHERE active = 1`
  return sql`SELECT id AS id, label AS label, sort AS sort, active AS active, updated_at AS updatedAt FROM backstage_milestone_types${predicate} ORDER BY sort, label COLLATE NOCASE`
}

export async function milestoneTypes(includeRetired = false): Promise<MilestoneTypeRow[]> {
  const rows = await db.all<{ active: number } & Omit<MilestoneTypeRow, 'active'>>(milestoneTypesQuery(includeRetired))
  return rows.map(row => ({ ...row, active: row.active === 1 }))
}

export function insertMilestoneTypeStatement(label: string, sort: number, updatedBy: string, id: string): SQL {
  return sql`INSERT INTO backstage_milestone_types (id, label, sort, updated_by) VALUES (${id}, ${label}, ${sort}, ${updatedBy})`
}

export function updateMilestoneTypeStatement(id: string, label: string, sort: number, updatedBy: string): SQL {
  return sql`UPDATE backstage_milestone_types SET label = ${label}, sort = ${sort}, updated_by = ${updatedBy}, updated_at = unixepoch() WHERE id = ${id}`
}

export function retireMilestoneTypeStatement(id: string, active: boolean, updatedBy: string): SQL {
  return sql`UPDATE backstage_milestone_types SET active = ${active ? 1 : 0}, updated_by = ${updatedBy}, updated_at = unixepoch() WHERE id = ${id}`
}

export interface PresetRow { id: string, label: string, body: string, sort: number, active: boolean, updatedAt: number }

export function presetsQuery(includeRetired: boolean): SQL {
  const predicate = includeRetired ? sql`` : sql` WHERE active = 1`
  return sql`SELECT id AS id, label AS label, body AS body, sort AS sort, active AS active, updated_at AS updatedAt FROM backstage_presets${predicate} ORDER BY sort, label COLLATE NOCASE`
}

export async function presets(includeRetired = false): Promise<PresetRow[]> {
  const rows = await db.all<{ active: number } & Omit<PresetRow, 'active'>>(presetsQuery(includeRetired))
  return rows.map(row => ({ ...row, active: row.active === 1 }))
}

export function insertPresetStatement(label: string, body: string, sort: number, updatedBy: string, id: string): SQL {
  return sql`INSERT INTO backstage_presets (id, label, body, sort, updated_by) VALUES (${id}, ${label}, ${body}, ${sort}, ${updatedBy})`
}

export function updatePresetStatement(id: string, label: string, body: string, sort: number, updatedBy: string): SQL {
  return sql`UPDATE backstage_presets SET label = ${label}, body = ${body}, sort = ${sort}, updated_by = ${updatedBy}, updated_at = unixepoch() WHERE id = ${id}`
}

export function retirePresetStatement(id: string, active: boolean, updatedBy: string): SQL {
  return sql`UPDATE backstage_presets SET active = ${active ? 1 : 0}, updated_by = ${updatedBy}, updated_at = unixepoch() WHERE id = ${id}`
}

// A milestone type or a preset, resolved server-side rather than trusted from the client: what
// gets snapshotted onto the message is the committee's own current wording (criteria 1, 2).
export async function milestoneLabel(id: string): Promise<string | undefined> {
  const [row] = await db.all<{ label: string }>(sql`SELECT label AS label FROM backstage_milestone_types WHERE id = ${id} AND active = 1`)
  return row?.label
}

export async function presetBody(id: string): Promise<string | undefined> {
  const [row] = await db.all<{ body: string }>(sql`SELECT body AS body FROM backstage_presets WHERE id = ${id} AND active = 1`)
  return row?.body
}

// Free text and preset messages purge at 30 days; a milestone is night-report data and is
// never touched here, enforced again at the trigger layer, not only by this predicate (0010).
export function staleMessagesQuery(beforeEpoch: number): SQL {
  return sql`SELECT id AS id FROM backstage_messages WHERE milestone_type_id IS NULL AND composed_at < ${beforeEpoch}`
}

export function purgeStaleMessagesStatement(beforeEpoch: number): SQL {
  return sql`DELETE FROM backstage_messages WHERE milestone_type_id IS NULL AND composed_at < ${beforeEpoch}`
}

// `label` is free text and can name people. Only a device nothing still references purges, and
// only past its own `joined_at` cutoff, so a quiet-but-recently-joined device is never swept.
export function staleDevicesQuery(beforeEpoch: number): SQL {
  return sql`
    SELECT id AS id FROM backstage_devices
    WHERE joined_at < ${beforeEpoch}
      AND NOT EXISTS (SELECT 1 FROM backstage_messages WHERE device_id = backstage_devices.id)
  `
}

export function purgeStaleDevicesStatement(beforeEpoch: number): SQL {
  return sql`
    DELETE FROM backstage_devices
    WHERE joined_at < ${beforeEpoch}
      AND NOT EXISTS (SELECT 1 FROM backstage_messages WHERE device_id = backstage_devices.id)
  `
}

export interface PurgeResult { messages: number, devices: number }

// Counted before deleting, since not every driver here reports DELETE's affected row count.
// Messages purge first, so a device they orphan is swept in the same run, not the next one.
export async function purgeStaleMessages(now = new Date()): Promise<PurgeResult> {
  const cutoff = Math.floor(now.getTime() / 1000) - MESSAGE_RETENTION_DAYS * 24 * 60 * 60
  const staleMessages = await db.all<{ id: string }>(staleMessagesQuery(cutoff))
  if (staleMessages.length > 0) await db.run(purgeStaleMessagesStatement(cutoff))

  const staleDevices = await db.all<{ id: string }>(staleDevicesQuery(cutoff))
  if (staleDevices.length > 0) await db.run(purgeStaleDevicesStatement(cutoff))

  return { messages: staleMessages.length, devices: staleDevices.length }
}
