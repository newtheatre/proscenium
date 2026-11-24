// Calendar imports by secret address (I1 to I6, AV-26): connecting, refreshing, failing and
// disconnecting. The address is sealed and never shown again; only busy stretches are kept (I3).
import { sql } from 'drizzle-orm'
import { inAccountScope, newId, nowMs, openSpecial, refuse, sealSpecial, theatreTimeZone, useDb, useSetting, type UnitView } from '#kit'
import { localDateOf } from '#kit/clock'
import { notify, refusedAddress } from '#modules/core'
import { personsBusy } from '#modules/person-busy'
import type { ConnectionKind, ConnectionState, TentativeAs } from '../shared/levels'
import { importedBlocks } from './db/schema'
import { readCalendar, type ReadBlock } from './ics'
import { fetchCalendar } from './calls/calendar/fetch'

const BROKEN_AFTER = 3 // not-policy: rule I5's three failures in a row
const KEEP_BROKEN_MS = 7 * 86_400_000 // not-policy: rule I5 keeps a broken connection's blocks seven days
const REFRESH_GAP_MS = 60_000 // not-policy: rule I5's "Refresh now" at most once a minute
const MATCH_MS = 60_000 // not-policy: rule I4's "to within a minute"
const SET_ROWS = 400 // not-policy: under core.units.set-rows-limit's floor of 500

export interface ConnectInput { label: string, url: string, tentativeAs: TentativeAs }
interface ConnectionRow { id: string, account_id: string, kind: ConnectionKind, label: string, ics_url: string | null, tentative_as: TentativeAs, state: ConnectionState, failures: number, last_synced_at: number | null, last_tried_at: number | null }

/** webcal:// is the same address over https; anything else must be https and public (I1, C-49). */
export function calendarAddress(url: string): string {
  const address = url.trim().replace(/^webcals?:\/\//i, 'https://')
  const refused = refusedAddress(address)
  if (refused === 'not-a-url') refuse('availability.calendar.address', 'That is not a web address.', { status: 422 })
  if (refused) refuse('availability.calendar.address', 'A calendar address starts with https and is on the public internet.', { status: 422 })
  return new URL(address).toString()
}

/** The import window from now, as instants (I3). */
async function windowNow(): Promise<{ from: number, to: number }> {
  const from = nowMs()
  return { from, to: from + Number(await useSetting('availability.import.window')) * 1000 } // not-policy: seconds to milliseconds
}

/** One fetch and read of a calendar address; throws when it does not answer as a calendar. */
async function fetchBlocks(url: string, tentativeAs: TentativeAs): Promise<ReadBlock[]> {
  return readCalendar(await fetchCalendar(url), { ...await windowNow(), zone: await theatreTimeZone(), tentativeAs })
}

/** I4: drop blocks that are one of the person's own firm commitments, which the site already counts. */
async function withoutOurs(accountId: string, blocks: ReadBlock[]): Promise<ReadBlock[]> {
  if (!blocks.length) return blocks
  const firm = (await personsBusy([accountId], blocks[0]!.from, Math.max(...blocks.map(b => b.to)))).filter(r => r.firm)
  return blocks.filter(b => !firm.some(c => Math.abs(c.from - b.from) <= MATCH_MS && Math.abs(c.to - b.to) <= MATCH_MS))
}

/** Replace a connection's blocks in the unit: the delete and the new set commit together. */
function replaceBlocks(unit: UnitView, connectionId: string, blocks: ReadBlock[]): void {
  unit.add(sql`DELETE FROM availability_imported_blocks WHERE connection_id = ${connectionId}`)
  for (let i = 0; i < blocks.length; i += SET_ROWS) {
    unit.insertSet(importedBlocks, blocks.slice(i, i + SET_ROWS).map(b => ({ connectionId, startsAt: b.from, endsAt: b.to, level: b.level })))
  }
}

/** A6: the person's availability may have changed anywhere in the import window. */
async function announce(unit: UnitView, accountId: string): Promise<void> {
  const [{ from, to }, zone] = [await windowNow(), await theatreTimeZone()]
  unit.announce('availability.entry.updated', { accountId, from: localDateOf(from, zone), to: localDateOf(to, zone) }, { record: ['core.account', accountId] })
}

/** I1: the person connects a calendar address of their own, read once before it saves. */
export async function connectIcs(unit: UnitView, accountId: string, input: ConnectInput): Promise<string> {
  if (!await useSetting('availability.import.ics')) refuse('availability.calendar.off', 'Calendar addresses are switched off here.', { status: 403 })
  const count = (await useDb().all<{ n: number }>(sql`SELECT count(*) AS n FROM availability_calendar_connections WHERE ${inAccountScope('account_id', accountId)}`))[0]!.n
  const max = Number(await useSetting('availability.import.max-connections'))
  if (count >= max) refuse('availability.calendar.too-many', `At most ${max} calendars at once.`, { status: 422 })
  const url = calendarAddress(input.url)
  let blocks: ReadBlock[]
  try {
    blocks = await withoutOurs(accountId, await fetchBlocks(url, input.tentativeAs))
  }
  catch {
    refuse('availability.calendar.unreadable', 'That address did not give us a calendar. Check it is the secret address in iCal format.', { status: 422 })
  }
  const id = newId('avcc')
  const at = nowMs()
  unit.add(sql`INSERT INTO availability_calendar_connections (id, account_id, kind, label, ics_url, tentative_as, state, last_synced_at, last_tried_at, failures, created_at, updated_at)
    VALUES (${id}, ${accountId}, 'ics', ${input.label}, ${await sealSpecial(url)}, ${input.tentativeAs}, 'active', ${at}, ${at}, 0, ${at}, ${at})`)
  replaceBlocks(unit, id, blocks)
  await announce(unit, accountId)
  return id
}

async function ownConnection(id: string, accountId: string): Promise<ConnectionRow> {
  const row = (await useDb().all<ConnectionRow>(sql`SELECT * FROM availability_calendar_connections WHERE id = ${id} AND ${inAccountScope('account_id', accountId)}`))[0]
  if (!row) refuse('availability.calendar.not-found', 'There is no such calendar.', { status: 404 })
  return row
}

/** I5: refresh one connection, or count a failure; three in a row make it broken and tell the person once. */
async function refresh(unit: UnitView, row: ConnectionRow): Promise<ConnectionState> {
  const at = nowMs()
  try {
    const url = await openSpecial(row.ics_url)
    if (!url) throw new Error('no address')
    const blocks = await withoutOurs(row.account_id, await fetchBlocks(url, row.tentative_as))
    unit.add(sql`UPDATE availability_calendar_connections SET state = 'active', failures = 0, last_synced_at = ${at}, last_tried_at = ${at}, updated_at = ${at} WHERE id = ${row.id}`)
    replaceBlocks(unit, row.id, blocks)
    await announce(unit, row.account_id)
    return 'active'
  }
  catch {
    const failures = row.failures + 1
    const state: ConnectionState = failures >= BROKEN_AFTER ? 'broken' : 'failing'
    unit.add(sql`UPDATE availability_calendar_connections SET state = ${state}, failures = ${failures}, last_tried_at = ${at}, updated_at = ${at} WHERE id = ${row.id}`)
    if (state === 'broken' && row.state !== 'broken') {
      await notify(unit, 'availability.calendar-broken', { to: [{ accountId: row.account_id, variables: { label: row.label }, dedupeKey: `calendar-broken:${row.id}:${row.last_synced_at ?? 0}` }] })
    }
    return state
  }
}

/** The refresh job: one connection, if it still exists and is not broken. */
export async function refreshJob(unit: UnitView, connectionId: string): Promise<void> {
  const row = (await useDb().all<ConnectionRow>(sql`SELECT * FROM availability_calendar_connections WHERE id = ${connectionId} AND state <> 'broken'`))[0]
  if (row) await refresh(unit, row)
}

/** "Refresh now", by the person, at most once a minute; a broken connection that reads again recovers. */
export async function refreshNow(unit: UnitView, id: string, accountId: string): Promise<ConnectionState> {
  const row = await ownConnection(id, accountId)
  if (row.last_tried_at && nowMs() - row.last_tried_at < REFRESH_GAP_MS) refuse('availability.calendar.too-soon', 'This calendar was refreshed a moment ago.', { status: 429 })
  return refresh(unit, row)
}

/** The tentative choice and the label; a changed choice reads the calendar again. */
export async function changeConnection(unit: UnitView, id: string, accountId: string, input: { label: string, tentativeAs: TentativeAs }): Promise<void> {
  const row = await ownConnection(id, accountId)
  unit.add(sql`UPDATE availability_calendar_connections SET label = ${input.label}, tentative_as = ${input.tentativeAs}, updated_at = ${nowMs()} WHERE id = ${id}`)
  if (input.tentativeAs !== row.tentative_as) unit.enqueue('availability.refresh-calendar', { connectionId: id })
}

/** I5: disconnecting deletes the connection and its blocks at once. */
export async function disconnect(unit: UnitView, id: string, accountId: string): Promise<void> {
  const row = await ownConnection(id, accountId)
  unit.add(sql`DELETE FROM availability_imported_blocks WHERE connection_id = ${row.id}`)
  unit.add(sql`DELETE FROM availability_calendar_connections WHERE id = ${row.id}`).expect(1)
  await announce(unit, accountId)
}

/** The sync task: queue each live connection due a refresh, and drop a week-broken connection's blocks (I5). */
export async function syncCalendars(unit: UnitView): Promise<void> {
  const at = nowMs()
  const every = Number(await useSetting('availability.import.refresh')) * 1000 // not-policy: seconds to milliseconds
  const due = await useDb().all<{ id: string }>(sql`SELECT id FROM availability_calendar_connections
    WHERE state <> 'broken' AND (last_tried_at IS NULL OR last_tried_at <= ${at - every}) ORDER BY last_tried_at`)
  for (const d of due) unit.enqueue('availability.refresh-calendar', { connectionId: d.id }, { dedupeKey: `${d.id}:${Math.floor(at / every)}` })
  if (!await useSetting('availability.import.ics')) {
    unit.add(sql`DELETE FROM availability_imported_blocks WHERE connection_id IN (SELECT id FROM availability_calendar_connections WHERE kind = 'ics')`)
  }
  unit.add(sql`DELETE FROM availability_imported_blocks WHERE connection_id IN (SELECT id FROM availability_calendar_connections
    WHERE state = 'broken' AND coalesce(last_synced_at, created_at) <= ${at - KEEP_BROKEN_MS})`)
}

export interface ConnectionOut { id: string, kind: ConnectionKind, label: string, tentativeAs: TentativeAs, state: ConnectionState, lastSyncedAt: number | null }

/** S14: the person's own connections; never the address. */
export async function myConnections(accountId: string): Promise<ConnectionOut[]> {
  const rows = await useDb().all<ConnectionRow>(sql`SELECT * FROM availability_calendar_connections WHERE ${inAccountScope('account_id', accountId)} ORDER BY created_at`)
  return rows.map(r => ({ id: r.id, kind: r.kind, label: r.label, tentativeAs: r.tentative_as, state: r.state, lastSyncedAt: r.last_synced_at }))
}
