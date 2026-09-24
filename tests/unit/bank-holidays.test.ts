import { describe, expect, test } from 'bun:test'
import {
  GOV_UK_BANK_HOLIDAYS_URL,
  SYNC_ALERT_AFTER_DAYS,
  SYNC_FAILURES,
  SYNC_FAILURE_TEXT,
  SYNC_MAX_BYTES,
  SYNC_STALE_AFTER_DAYS,
  SYNC_TIMEOUT_MS,
  fetchGovUkHolidays,
  mergeHolidays,
  parseGovUkFeed,
  syncAlertDue,
  syncStanding,
} from '#shared/utils/bank-holidays'
import { CONFIG_KEYS, isSynced } from '#shared/utils/config'

// C-121 criteria 7 to 9 and decision 0092: the list is copied from gov.uk, validated before it is
// written, and a failure is one word from a fixed vocabulary. The network is always a stand-in.

const TODAY = '2026-09-24'

function feed(dates: string[], division = 'england-and-wales'): unknown {
  return {
    'england-and-wales': { division, events: dates.map(date => ({ title: 'A bank holiday', date, notes: '', bunting: true })) },
    'scotland': { division: 'scotland', events: [] },
  }
}

const PUBLISHED = ['2026-08-31', '2026-12-25', '2026-12-28', '2027-01-01', '2027-03-26', '2028-12-26']

describe('the feed is read only when it is what gov.uk publishes (criterion 7)', () => {
  test('a well-formed feed yields its England and Wales dates, sorted and without repeats', () => {
    const parsed = parseGovUkFeed(feed(['2027-01-01', '2026-12-25', '2027-01-01']), TODAY)
    expect(parsed).toEqual({ ok: true, dates: ['2026-12-25', '2027-01-01'] })
  })

  test('another division\'s dates are never read, even when they are the only ones there', () => {
    const scotland = { scotland: { division: 'scotland', events: [{ title: 'St Andrew\'s Day', date: '2026-11-30' }] } }
    expect(parseGovUkFeed(scotland, TODAY)).toEqual({ ok: false, failure: 'invalid' })
  })

  test('a division that names itself as something else is refused', () => {
    expect(parseGovUkFeed(feed(PUBLISHED, 'scotland'), TODAY)).toEqual({ ok: false, failure: 'invalid' })
  })

  test('a date that only looks like one is refused, and so is a date in another shape', () => {
    expect(parseGovUkFeed(feed(['2027-02-30']), TODAY)).toEqual({ ok: false, failure: 'invalid' })
    expect(parseGovUkFeed(feed(['25/12/2026']), TODAY)).toEqual({ ok: false, failure: 'invalid' })
    expect(parseGovUkFeed(feed(['2026-12-25T00:00:00Z']), TODAY)).toEqual({ ok: false, failure: 'invalid' })
  })

  test('an empty list of events is refused rather than read as no holidays (0038)', () => {
    expect(parseGovUkFeed(feed([]), TODAY)).toEqual({ ok: false, failure: 'invalid' })
  })

  test('something that is not the feed at all is refused', () => {
    expect(parseGovUkFeed(null, TODAY)).toEqual({ ok: false, failure: 'invalid' })
    expect(parseGovUkFeed([], TODAY)).toEqual({ ok: false, failure: 'invalid' })
    expect(parseGovUkFeed({ 'england-and-wales': { division: 'england-and-wales', events: 'soon' } }, TODAY))
      .toEqual({ ok: false, failure: 'invalid' })
  })

  test('a feed that stops before today is out of date, and one reaching today is not', () => {
    expect(parseGovUkFeed(feed(['2025-12-25', '2026-08-31']), TODAY)).toEqual({ ok: false, failure: 'out-of-date' })
    expect(parseGovUkFeed(feed(['2026-08-31', TODAY]), TODAY)).toEqual({ ok: true, dates: ['2026-08-31', TODAY] })
  })
})

describe('the merge: gov.uk is authoritative from its first date on (criterion 7)', () => {
  test('a date the feed moved is corrected, not kept beside its replacement', () => {
    // The moved date must fall on or after the feed's first; one before it is an old year and kept.
    const stored = ['2027-01-01', '2027-05-31', '2027-12-27']
    const fetched = ['2027-01-01', '2027-06-03', '2027-12-27']
    expect(mergeHolidays(stored, fetched)).toEqual(['2027-01-01', '2027-06-03', '2027-12-27'])
  })

  test('stored dates older than the feed\'s first are kept, because gov.uk drops old years', () => {
    expect(mergeHolidays(['2018-12-25', '2019-01-01', '2026-12-25'], ['2019-01-01', '2026-12-25', '2027-01-01']))
      .toEqual(['2018-12-25', '2019-01-01', '2026-12-25', '2027-01-01'])
  })

  test('a stored date past the feed\'s end is dropped: the list is gov.uk\'s and nobody else\'s (0092)', () => {
    expect(mergeHolidays(['2026-12-25', '2029-12-25'], ['2026-12-25', '2028-12-26'])).toEqual(['2026-12-25', '2028-12-26'])
  })

  test('the result is sorted, holds no repeats, and satisfies the key\'s own schema', () => {
    const merged = mergeHolidays(['2019-01-01', '2018-12-25', '2018-12-25'], ['2027-01-01', '2026-12-25'])
    expect(merged).toEqual(['2018-12-25', '2019-01-01', '2026-12-25', '2027-01-01'])
    expect(CONFIG_KEYS.BANK_HOLIDAYS.schema.safeParse(merged).success).toBe(true)
  })
})

function answering(body: string, init: ResponseInit = {}): { fetcher: typeof fetch, calls: { url: string, init: RequestInit | undefined }[] } {
  const calls: { url: string, init: RequestInit | undefined }[] = []
  const fetcher = (async (url: string | URL | Request, request?: RequestInit) => {
    calls.push({ url: String(url), init: request })
    return new Response(body, { status: 200, ...init })
  }) as typeof fetch
  return { fetcher, calls }
}

function throwing(error: unknown): typeof fetch {
  return (async () => {
    throw error
  }) as unknown as typeof fetch
}

describe('the outbound call and every way it fails (criterion 7, 0092)', () => {
  test('it asks gov.uk once, by GET, with a timeout and without following a redirect', async () => {
    const { fetcher, calls } = answering(JSON.stringify(feed(PUBLISHED)))
    expect(await fetchGovUkHolidays(fetcher, TODAY)).toEqual({ ok: true, dates: PUBLISHED })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(GOV_UK_BANK_HOLIDAYS_URL)
    expect(GOV_UK_BANK_HOLIDAYS_URL).toBe('https://www.gov.uk/bank-holidays.json')
    expect(calls[0]!.init?.method).toBe('GET')
    expect(calls[0]!.init?.redirect).toBe('manual')
    expect(calls[0]!.init?.signal).toBeInstanceOf(AbortSignal)
    expect(calls[0]!.init?.body).toBeUndefined()
    expect(SYNC_TIMEOUT_MS).toBe(10_000)
  })

  test('a timeout is a timeout, and any other thrown error is the network', async () => {
    expect(await fetchGovUkHolidays(throwing(new DOMException('slow', 'TimeoutError')), TODAY)).toEqual({ ok: false, failure: 'timeout' })
    expect(await fetchGovUkHolidays(throwing(new DOMException('slow', 'AbortError')), TODAY)).toEqual({ ok: false, failure: 'timeout' })
    expect(await fetchGovUkHolidays(throwing(new TypeError('fetch failed')), TODAY)).toEqual({ ok: false, failure: 'network' })
  })

  test('anything but a plain 200 is an http failure carrying its status, a redirect included', async () => {
    expect(await fetchGovUkHolidays(answering('down', { status: 503 }).fetcher, TODAY)).toEqual({ ok: false, failure: 'http', status: 503 })
    expect(await fetchGovUkHolidays(answering('', { status: 301 }).fetcher, TODAY)).toEqual({ ok: false, failure: 'http', status: 301 })
  })

  test('a body far larger than a list of dates is refused before it is parsed', async () => {
    const huge = 'x'.repeat(SYNC_MAX_BYTES + 1)
    expect(await fetchGovUkHolidays(answering(huge).fetcher, TODAY)).toEqual({ ok: false, failure: 'too-large' })
    // A stand-in rather than a Response, which may recompute the length it is handed.
    const declared = (async () => ({
      status: 200,
      headers: new Headers({ 'content-length': String(SYNC_MAX_BYTES + 1) }),
      text: async () => '{}',
    })) as unknown as typeof fetch
    expect(await fetchGovUkHolidays(declared, TODAY)).toEqual({ ok: false, failure: 'too-large' })
  })

  test('the cap counts bytes, and an undeclared body is not read past it', async () => {
    const wide = `"${'é'.repeat(SYNC_MAX_BYTES / 2 + 1)}"`
    expect(await fetchGovUkHolidays(answering(wide).fetcher, TODAY)).toEqual({ ok: false, failure: 'too-large' })

    let pulled = 0
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++
        controller.enqueue(new Uint8Array(64 * 1024))
      },
    })
    const streaming = (async () => new Response(endless, { status: 200 })) as unknown as typeof fetch
    expect(await fetchGovUkHolidays(streaming, TODAY)).toEqual({ ok: false, failure: 'too-large' })
    expect(pulled).toBeLessThan(SYNC_MAX_BYTES / (64 * 1024) + 4)
  })

  test('a body that is not JSON, and JSON that is not the feed, are told apart', async () => {
    expect(await fetchGovUkHolidays(answering('<html>maintenance</html>').fetcher, TODAY)).toEqual({ ok: false, failure: 'not-json' })
    expect(await fetchGovUkHolidays(answering('{"hello":"world"}').fetcher, TODAY)).toEqual({ ok: false, failure: 'invalid' })
  })

  test('every failure word has a sentence for the settings card, and no sentence names a key', () => {
    for (const failure of SYNC_FAILURES) {
      expect(SYNC_FAILURE_TEXT[failure].length).toBeGreaterThan(0)
      expect(SYNC_FAILURE_TEXT[failure]).not.toContain('BANK_HOLIDAYS')
    }
  })
})

const DAY = 86_400
const NOW = 2_000_000_000

describe('a failed or stale sync is said, not hidden (criterion 8)', () => {
  test('never synced reads as never, and is not ok', () => {
    expect(syncStanding({ syncedAt: null, failedAt: null, failure: null }, NOW))
      .toEqual({ syncedAt: null, failedAt: null, failure: null, ok: false, status: 'never' })
  })

  test('a recent success is ok', () => {
    const standing = syncStanding({ syncedAt: NOW - DAY, failedAt: null, failure: null }, NOW)
    expect(standing.status).toBe('synced')
    expect(standing.ok).toBe(true)
  })

  test('a failure after the last success is failed, naming why', () => {
    const standing = syncStanding({ syncedAt: NOW - 7 * DAY, failedAt: NOW - 60, failure: 'timeout' }, NOW)
    expect(standing).toMatchObject({ ok: false, status: 'failed', failure: 'timeout' })
  })

  test('a failure before the last success is history, not the current state', () => {
    const standing = syncStanding({ syncedAt: NOW - 60, failedAt: NOW - DAY, failure: 'network' }, NOW)
    expect(standing).toMatchObject({ ok: true, status: 'synced', failure: null })
  })

  test('a failure in the same second as a success loses to it, because the success wrote the list', () => {
    expect(syncStanding({ syncedAt: NOW, failedAt: NOW, failure: 'write' }, NOW).status).toBe('synced')
  })

  test('failing without ever having synced is failed rather than never', () => {
    expect(syncStanding({ syncedAt: null, failedAt: NOW, failure: 'http' }, NOW).status).toBe('failed')
  })

  test('no success for longer than one missed weekly run is stale, even with no failure recorded', () => {
    expect(SYNC_STALE_AFTER_DAYS).toBe(8)
    expect(syncStanding({ syncedAt: NOW - 8 * DAY, failedAt: null, failure: null }, NOW).status).toBe('synced')
    expect(syncStanding({ syncedAt: NOW - 8 * DAY - 1, failedAt: null, failure: null }, NOW).status).toBe('stale')
  })
})

describe('the IT Manager is told once it stays failing (criterion 9)', () => {
  test('no streak is never due', () => {
    expect(syncAlertDue(null, NOW)).toBe(false)
  })

  test('a streak younger than the second weekly run is not due, and one that old is', () => {
    expect(SYNC_ALERT_AFTER_DAYS).toBe(6)
    expect(syncAlertDue(NOW - 6 * DAY + 1, NOW)).toBe(false)
    expect(syncAlertDue(NOW - 6 * DAY, NOW)).toBe(true)
  })
})

describe('the key is marked as synced, so the write path can refuse it (criterion 4)', () => {
  test('BANK_HOLIDAYS is synced and an ordinary key is not', () => {
    expect(isSynced('BANK_HOLIDAYS')).toBe(true)
    expect(isSynced('EXTERNAL_REQUEST_NOTICE_WORKING_DAYS')).toBe(false)
  })
})
