import { z } from 'zod'

// Bank holidays are copied from gov.uk by a weekly task and never typed (C-121, 0091). The
// fetch, its validation and the merge live here, pure, so every refusal is proved without a network.

export const GOV_UK_BANK_HOLIDAYS_URL = 'https://www.gov.uk/bank-holidays.json'
export const GOV_UK_DIVISION = 'england-and-wales'

// Tied to the weekly cron in nuxt.config.ts rather than to any committee rule (0091).
export const SYNC_TIMEOUT_MS = 10_000
export const SYNC_MAX_BYTES = 512 * 1024
export const SYNC_STALE_AFTER_DAYS = 8
export const SYNC_ALERT_AFTER_DAYS = 6

// A fixed vocabulary, because the audit trail carries no free text and a response body is exactly that (0011).
export const SYNC_FAILURES = ['timeout', 'network', 'http', 'too-large', 'not-json', 'invalid', 'out-of-date', 'write'] as const
export type SyncFailure = (typeof SYNC_FAILURES)[number]

export interface SyncFailed { ok: false, failure: SyncFailure, status?: number }
export type FeedOutcome = { ok: true, dates: string[] } | SyncFailed

// A real calendar date, not merely one shaped like it: 2027-02-30 matches the pattern.
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const at = new Date(Date.UTC(year, month - 1, day))
  return at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day
}

export const govUkFeed = z.object({
  [GOV_UK_DIVISION]: z.object({
    division: z.literal(GOV_UK_DIVISION),
    events: z.array(z.object({
      title: z.string(),
      date: z.string().refine(isCalendarDate, 'not a calendar date'),
    })).min(1).max(1000),
  }),
})

// `today` is a London date. A feed that stops before it has stopped being published, and a list
// that has stopped moving is what the refusal in 0038 exists to catch.
export function parseGovUkFeed(body: unknown, today: string): FeedOutcome {
  const parsed = govUkFeed.safeParse(body)
  if (!parsed.success) return { ok: false, failure: 'invalid' }

  const dates = [...new Set(parsed.data[GOV_UK_DIVISION].events.map(event => event.date))].sort()
  if (dates.at(-1)! < today) return { ok: false, failure: 'out-of-date' }

  return { ok: true, dates }
}

// The feed is authoritative from its first date on, so a moved holiday is corrected; stored dates
// before it are kept, because gov.uk drops old years and a request is counted from its ask.
export function mergeHolidays(stored: readonly string[], feed: readonly string[]): string[] {
  const first = [...feed].sort()[0]
  if (!first) return [...new Set(stored)].sort()
  return [...new Set([...stored.filter(date => date < first), ...feed])].sort()
}

// Never throws: every way the call can go wrong is one of SYNC_FAILURES.
export async function fetchGovUkHolidays(fetcher: typeof fetch, today: string): Promise<FeedOutcome> {
  let response: Response
  try {
    response = await fetcher(GOV_UK_BANK_HOLIDAYS_URL, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
    })
  }
  catch (error) {
    const name = (error as { name?: string } | null)?.name
    return { ok: false, failure: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network' }
  }

  if (response.status !== 200) return { ok: false, failure: 'http', status: response.status }

  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > SYNC_MAX_BYTES) return { ok: false, failure: 'too-large' }

  let text: string
  try {
    text = await response.text()
  }
  catch (error) {
    const name = (error as { name?: string } | null)?.name
    return { ok: false, failure: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network' }
  }
  if (text.length > SYNC_MAX_BYTES) return { ok: false, failure: 'too-large' }

  let body: unknown
  try {
    body = JSON.parse(text)
  }
  catch {
    return { ok: false, failure: 'not-json' }
  }

  return parseGovUkFeed(body, today)
}

export interface SyncHistory {
  // Unix seconds of the newest success and the newest failure, null where there is none.
  syncedAt: number | null
  failedAt: number | null
  failure: SyncFailure | null
}

export type SyncStatus = 'synced' | 'failed' | 'stale' | 'never'

export interface SyncStanding extends SyncHistory {
  ok: boolean
  status: SyncStatus
}

// Failed wins over stale and never: the newest thing that happened is what the reader acts on. A
// failure in the same second as a success loses to it, because the success wrote the list.
export function syncStanding(history: SyncHistory, nowSeconds: number): SyncStanding {
  const failedLast = history.failedAt !== null && (history.syncedAt === null || history.failedAt > history.syncedAt)
  const status: SyncStatus = failedLast
    ? 'failed'
    : history.syncedAt === null
      ? 'never'
      : nowSeconds - history.syncedAt > SYNC_STALE_AFTER_DAYS * 86_400 ? 'stale' : 'synced'

  return { ...history, failure: failedLast ? history.failure : null, ok: status === 'synced', status }
}

// A streak starts at its first failure after the last success; one old enough has outlived a
// second weekly run, which is "stays failing" (0091).
export function syncAlertDue(streakStartedAt: number | null, nowSeconds: number): boolean {
  return streakStartedAt !== null && nowSeconds - streakStartedAt >= SYNC_ALERT_AFTER_DAYS * 86_400
}

export const SYNC_FAILURE_TEXT: Record<SyncFailure, string> = {
  'timeout': 'gov.uk did not answer within ten seconds',
  'network': 'gov.uk could not be reached',
  'http': 'gov.uk answered with an error',
  'too-large': 'gov.uk sent far more than a list of dates',
  'not-json': 'gov.uk sent something that was not a list of dates',
  'invalid': 'gov.uk sent a list this could not read',
  'out-of-date': 'gov.uk sent a list that stops before today',
  'write': 'the list could not be saved',
}
