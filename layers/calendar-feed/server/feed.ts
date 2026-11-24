// One private feed per person (C-70, CF1, CF2, CF5, CF6). The token is a keyed hash of the account and
// a generation, worked out again to show the address; only the token's own hash is stored.
import { first, linkTokens, log, nowMs, siteUrl, usePoint, wordsFrom, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { siteMarker, type CalendarFeed } from '#modules/core'
import catalogue from '../i18n/en-GB.json'
import { icsFile, type IcsEvent } from './ics'

const say = wordsFrom(catalogue)
const DAY = 24 * 60 * 60_000 // not-policy: a day in milliseconds
const BACK = 30 * DAY // not-policy: the point's contract asks contributors for 30 days back
const AHEAD = 366 * DAY // not-policy: and twelve months ahead

// The seed is Front of house's, which made the first feeds, so carried-over addresses still open (CF5).
const tokenOf = (accountId: string, generation: number) => linkTokens.hash(`front-of-house.feed:${accountId}:${generation}`)

const addressOf = async (accountId: string, generation: number) => siteUrl(`/calendar/${await tokenOf(accountId, generation)}.ics`)

const held = (accountId: string) => first<{ account_id: string, generation: number }>(`SELECT account_id, generation FROM calendar_feed_tokens WHERE account_id IN (${accountScopeSql('?1')})`, accountId)

async function write(unit: UnitView, accountId: string, generation: number): Promise<string> {
  const hash = await linkTokens.hash(await tokenOf(accountId, generation))
  unit.add({
    sql: `INSERT INTO calendar_feed_tokens (account_id, token_hash, generation, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (account_id) DO UPDATE SET token_hash = excluded.token_hash, generation = excluded.generation, created_at = excluded.created_at`,
    params: [accountId, hash, generation, nowMs()],
  })
  // The marker is fixed the first time anyone has an address, so every UID carries it from the start.
  await siteMarker(unit)
  return addressOf(accountId, generation)
}

/** The person's feed address, made on first use. */
export async function feedAddress(unit: UnitView, accountId: string): Promise<string> {
  const existing = await held(accountId)
  return existing ? addressOf(existing.account_id, existing.generation) : write(unit, accountId, 1)
}

/** A new address; the old one stops working at once. */
export async function resetFeed(unit: UnitView, accountId: string): Promise<string> {
  const existing = await held(accountId)
  return write(unit, existing?.account_id ?? accountId, (existing?.generation ?? 0) + 1)
}

/** The account a presented token opens, or null for an unknown or reset one. */
export async function accountOfFeed(token: string): Promise<string | null> {
  const row = await first<{ account_id: string }>('SELECT account_id FROM calendar_feed_tokens WHERE token_hash = ?', await linkTokens.hash(token))
  return row?.account_id ?? null
}

/** Everything the person is on, from every contributor that is on; one that fails adds nothing (CF6). */
export async function feedEvents(accountId: string, marker: string): Promise<IcsEvent[]> {
  const now = nowMs()
  const out: IcsEvent[] = []
  for (const c of await usePoint<CalendarFeed>('core.calendar-feed')) {
    try {
      for (const e of await c.value.events(accountId, now - BACK, now + AHEAD)) out.push({ ...e, uid: `${c.id}.${e.key}@${marker}` })
    }
    catch (error) {
      log.error('calendar-feed.contributor-failed', { contributor: c.id, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return out.sort((a, b) => a.startsAt - b.startsAt || a.uid.localeCompare(b.uid))
}

/** The calendar file a token opens, or null when the token opens nothing. */
export async function feedFile(unit: UnitView, token: string): Promise<string | null> {
  const accountId = await accountOfFeed(token)
  if (!accountId) return null
  return icsFile(say('calendar-feed.file.name'), await feedEvents(accountId, await siteMarker(unit)))
}
