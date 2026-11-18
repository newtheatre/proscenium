// Shifts as calendar files (SU-8, EM-4): one .ics for one place on a shift, and a private feed of
// everything a person is on, which a calendar app can subscribe to. The feed's address holds a
// secret token; only its keyed hash is kept to find the person, and the sealed token lets the
// screen show the address again. Resetting makes a new token and the old address stops working.
import { all, first, linkTokens, nowMs, siteUrl, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { LIVE_STATES } from './db/schema'
import { partFormatters } from './words'

const live = LIVE_STATES.map(s => `'${s}'`).join(', ')
const WEEK = 7 * 24 * 60 * 60_000 // not-policy: how far back the feed reaches

interface Row {
  id: string
  state: string
  call_at: number
  ends_at: number
  briefing: string | null
  updated_at: number
  duty: string
  title: string | null
  production_title: string | null
  curtain: number | null
  venue_name: string | null
  space_name: string | null
}

const SELECT = `SELECT a.id, a.state, s.call_at, s.ends_at, s.briefing, s.updated_at, d.name AS duty, s.title, p.title AS production_title, f.starts_at AS curtain, v.name AS venue_name, sp.name AS space_name
  FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id JOIN front_of_house_duties d ON d.id = s.duty_id
  LEFT JOIN core_performances f ON f.id = s.performance_id LEFT JOIN core_productions p ON p.id = f.production_id
  LEFT JOIN core_venues v ON v.id = coalesce(s.venue_id, f.venue_id) LEFT JOIN core_spaces sp ON sp.id = f.space_id`

/** The text of a calendar property: commas, semicolons, backslashes and line breaks escaped. */
const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** A content line folded at 75 bytes, each continuation starting with one space. */
function fold(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line // not-policy: the calendar format's line length
  const out: string[] = []
  let current = ''
  for (const char of line) {
    if (encoder.encode(current + char).length > (out.length ? 74 : 75)) { // not-policy: the calendar format's line length, less the leading space
      out.push(current)
      current = ''
    }
    current += char
  }
  out.push(current)
  return out.join('\r\n ')
}

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') // not-policy: drops the milliseconds

function eventOf(row: Row, host: string, clock: (at: number) => string): string[] {
  const what = row.production_title ? `${row.duty}, ${row.production_title}` : row.title ? `${row.duty}: ${row.title}` : row.duty
  const place = [row.venue_name, row.space_name].filter(Boolean).join(', ')
  // Curtain up is the performance's own start; the event itself runs from the call.
  const description = [row.curtain !== null ? `Curtain up: ${clock(row.curtain)}` : null, row.briefing].filter(Boolean).join('\n')
  return [
    'BEGIN:VEVENT',
    `UID:${row.id}@${host}`,
    `DTSTAMP:${stamp(row.updated_at)}`,
    `LAST-MODIFIED:${stamp(row.updated_at)}`,
    `SEQUENCE:${Math.floor(row.updated_at / 60_000)}`, // not-policy: minutes, so a later change always sorts higher
    `DTSTART:${stamp(row.call_at)}`,
    `DTEND:${stamp(row.ends_at)}`,
    `SUMMARY:${escape(what)}`,
    ...(place ? [`LOCATION:${escape(place)}`] : []),
    ...(description ? [`DESCRIPTION:${escape(description)}`] : []),
    `STATUS:${row.state === 'requested' ? 'TENTATIVE' : 'CONFIRMED'}`,
    'END:VEVENT',
  ]
}

async function file(rows: Row[], name: string): Promise<string> {
  const host = new URL(await siteUrl('/')).host
  const { time } = await partFormatters()
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Proscenium//Front of house//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(name)}`,
    ...rows.flatMap(r => eventOf(r, host, time)),
    'END:VCALENDAR',
  ]
  return `${lines.map(fold).join('\r\n')}\r\n`
}

/** One place on a shift as a calendar file, or null when there is no live place by that id. */
export async function calendarOfAssignment(assignmentId: string): Promise<string | null> {
  const row = await first<Row>(`${SELECT} WHERE a.id = ? AND a.state IN (${live})`, assignmentId)
  return row ? file([row], 'Shift') : null
}

/** Every live place the person has, from a week ago on. */
export async function calendarOfAccount(accountId: string): Promise<string> {
  const rows = await all<Row>(`${SELECT} WHERE a.account_id IN (${accountScopeSql('?1')}) AND a.state IN (${live}) AND s.state = 'published' AND s.ends_at > ?2 ORDER BY s.call_at`, accountId, nowMs() - WEEK) // not-policy: numbered parameters
  return file(rows, 'My shifts')
}

// ---------------------------------------------------------------------------------------------
// The private feed

/** The token for a generation of a person's feed: worked out, never stored. */
const tokenOf = (accountId: string, generation: number) => linkTokens.hash(`front-of-house.feed:${accountId}:${generation}`)

const addressOf = async (accountId: string, generation: number) => siteUrl(`/api/front-of-house/calendar/${await tokenOf(accountId, generation)}`)

/** The person's feed address, made on first use. */
export async function feedAddress(unit: UnitView, accountId: string): Promise<string> {
  const existing = await first<{ account_id: string, generation: number }>(`SELECT account_id, generation FROM front_of_house_calendar_feeds WHERE account_id IN (${accountScopeSql('?1')})`, accountId)
  if (existing) return addressOf(existing.account_id, existing.generation)
  return writeFeed(unit, accountId, 1)
}

/** A new address. The old one stops working. */
export async function resetFeed(unit: UnitView, accountId: string): Promise<string> {
  const existing = await first<{ account_id: string, generation: number }>(`SELECT account_id, generation FROM front_of_house_calendar_feeds WHERE account_id IN (${accountScopeSql('?1')})`, accountId)
  return writeFeed(unit, existing?.account_id ?? accountId, (existing?.generation ?? 0) + 1)
}

async function writeFeed(unit: UnitView, accountId: string, generation: number): Promise<string> {
  const hash = await linkTokens.hash(await tokenOf(accountId, generation))
  unit.add({
    sql: `INSERT INTO front_of_house_calendar_feeds (account_id, token_hash, generation, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (account_id) DO UPDATE SET token_hash = excluded.token_hash, generation = excluded.generation, created_at = excluded.created_at`,
    params: [accountId, hash, generation, nowMs()],
  })
  return addressOf(accountId, generation)
}

/** The account a feed address belongs to. */
export async function accountOfFeed(token: string): Promise<string | null> {
  const row = await first<{ account_id: string }>('SELECT account_id FROM front_of_house_calendar_feeds WHERE token_hash = ?', await linkTokens.hash(token))
  return row?.account_id ?? null
}
