import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// A-126, built as K-111; the criterion numbers below are A-126's. The sweep warns twice,
// anonymises what is due, exempts what 0011 names, caps both halves, and ships disarmed.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const YEAR_SECONDS = Math.round(365.25 * 86_400)

let app: AppUnderTest
let cookie = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie

  // No workshop proposed a warning cadence, so those two keys ship unset (0019) and the sweep is
  // blocked until they are set, exactly as it will be in production before it is relied on.
  await setConfig('RETENTION_WARNING_DAYS', 30)
  await setConfig('RETENTION_FINAL_WARNING_DAYS', 7)
  // Both caps ship at the carried figures; a suite of a handful of accounts wants smaller ones.
  await setConfig('RETENTION_SWEEP_CAP', 50)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function read<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

const send = (method: string, path: string, body?: unknown): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': cookie },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

const setConfig = (key: string, value: unknown): Promise<Response> => send('PUT', `/api/admin/config/${key}`, { value })
const arm = (on: boolean): Promise<Response> => setConfig('RETENTION_ARMED', on)

interface RetentionRun {
  armed: boolean
  window: number
  final: number
  anonymised: number
  wouldAnonymise: string[]
  warningsCappedAt: number | null
  anonymisationsCappedAt: number | null
  digests: number
}

// Nitro runs a task over its dev endpoint, which is how the schedule reaches it in production.
const runSweep = async (): Promise<RetentionRun> => {
  const answered = await fetch(`${app.baseURL}/_nitro/tasks/retention:sweep`, { method: 'POST' })
  expect(answered.status).toBe(200)
  return (await answered.json() as { result: RetentionRun }).result
}

// Registers a real account and back-dates its last sign-in, so "N days from the threshold" is
// exact rather than approximated from whenever the test happened to run.
async function inactiveAccount(daysFromThreshold: number, years = 2): Promise<string> {
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = registrableAddress('retention')
  const password = generatePassword()
  await send('POST', '/api/auth/register', { email, name: person.name, password })
  markVerified(app, email)

  const id = read<{ id: string }>('SELECT id FROM users WHERE email = ?', email)!.id
  const now = Math.floor(Date.now() / 1000)
  const lastLoginAt = now - Math.round(years * YEAR_SECONDS) + daysFromThreshold * 86_400
  write('UPDATE users SET last_login_at = ?, password = ?, google_sub = NULL WHERE id = ?', lastLoginAt, 'x', id)
  return id
}

function claimsFor(userId: string): { type: string }[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query('SELECT type FROM notification_log WHERE user_id = ? AND type LIKE \'retention.%\'').all(userId) as { type: string }[]
  }
  finally {
    database.close()
  }
}

const isAnonymised = (userId: string): boolean =>
  read<{ anonymisedAt: number | null }>('SELECT anonymised_at as anonymisedAt FROM users WHERE id = ?', userId)?.anonymisedAt !== null

describe.skipIf(skip !== null)('the sweep ships disarmed (criterion 5)', () => {
  test('a disarmed run reports what it would warn about and writes no claim', async () => {
    const id = await inactiveAccount(20)

    const run = await runSweep()
    expect(run.armed).toBe(false)
    expect(run.window).toBeGreaterThan(0)
    expect(claimsFor(id)).toEqual([])
  })

  test('a disarmed run reports who it would anonymise and changes nothing', async () => {
    const id = await inactiveAccount(-5)

    const run = await runSweep()
    expect(run.wouldAnonymise).toContain(id)
    expect(run.anonymised).toBe(0)
    expect(isAnonymised(id)).toBe(false)
  })
})

describe.skipIf(skip !== null)('armed, it warns once per account and window (criteria 1, 3)', () => {
  test('the same account is warned once, however many times the sweep runs', async () => {
    const id = await inactiveAccount(20)
    await arm(true)

    try {
      await runSweep()
      const after = claimsFor(id).filter(claim => claim.type === 'retention.warning.window')
      expect(after).toHaveLength(1)

      await runSweep()
      expect(claimsFor(id).filter(claim => claim.type === 'retention.warning.window')).toHaveLength(1)
    }
    finally {
      await arm(false)
    }
  })

  test('an account inside both windows carries both claims, not one', async () => {
    const id = await inactiveAccount(5)
    await arm(true)

    try {
      await runSweep()
      const kinds = claimsFor(id).map(claim => claim.type)
      expect(kinds).toContain('retention.warning.window')
      expect(kinds).toContain('retention.warning.final')
    }
    finally {
      await arm(false)
    }
  })

  // Criterion 3's own trap: a claim that outlived a sign-in would never warn again.
  test('a sign-in changes the claim, so a later dormant spell is warned about again', async () => {
    const id = await inactiveAccount(20)
    await arm(true)

    try {
      await runSweep()
      expect(claimsFor(id).filter(claim => claim.type === 'retention.warning.window')).toHaveLength(1)

      // A sign-in, simulated: last_login_at moves (0011's own trigger for the clock). Offset by a
      // minute so the claim key is provably different, not coincidentally the same second.
      const now = Math.floor(Date.now() / 1000) + 60
      const backToWindow = now - Math.round(2 * YEAR_SECONDS) + 20 * 86_400
      write('UPDATE users SET last_login_at = ? WHERE id = ?', backToWindow, id)

      await runSweep()
      expect(claimsFor(id).filter(claim => claim.type === 'retention.warning.window')).toHaveLength(2)
    }
    finally {
      await arm(false)
    }
  })
})

describe.skipIf(skip !== null)('exemptions and the two caps (criteria 2, 4)', () => {
  test('a current member is never anonymised, whatever their inactivity', async () => {
    const id = await inactiveAccount(-10)
    write(
      `INSERT INTO memberships (id, user_id, starts_on, expires_on, source) VALUES (?, ?, date('now', '-1 month'), date('now', '+6 months'), 'MANUAL')`,
      crypto.randomUUID(), id,
    )
    await arm(true)

    try {
      await runSweep()
      expect(isAnonymised(id)).toBe(false)
    }
    finally {
      await arm(false)
    }
  })

  test('a live role holder is exempt', async () => {
    const id = await inactiveAccount(-10)
    await send('POST', '/api/admin/roles', { userId: id, role: 'BOX_OFFICE' })
    await arm(true)

    try {
      await runSweep()
      expect(isAnonymised(id)).toBe(false)
    }
    finally {
      await arm(false)
    }
  })

  test('an account owing on a tab is exempt', async () => {
    const id = await inactiveAccount(-10)
    write(
      `INSERT INTO ledger_entries (id, london_day, source, tender, total_pence, tab_debtor_id)
       VALUES (?, date('now'), 'TILL', 'TAB', 500, ?)`,
      crypto.randomUUID(), id,
    )
    await arm(true)

    try {
      await runSweep()
      expect(isAnonymised(id)).toBe(false)
    }
    finally {
      await arm(false)
    }
  })

  test('a settled tab is no longer an exemption', async () => {
    const id = await inactiveAccount(-10)
    // A charge settles by reference, never by rewriting its own row (F-109): a second entry
    // carries a ledger_lines row whose settles_entry_id names the charge it covers.
    const chargeId = crypto.randomUUID()
    write(
      `INSERT INTO ledger_entries (id, london_day, source, tender, total_pence, tab_debtor_id)
       VALUES (?, date('now'), 'TILL', 'TAB', 500, ?)`,
      chargeId, id,
    )
    const settlementId = crypto.randomUUID()
    write(
      `INSERT INTO ledger_entries (id, london_day, source, tender, total_pence)
       VALUES (?, date('now'), 'DESK', 'CARD', 500)`,
      settlementId,
    )
    write(
      `INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty, settles_entry_id)
       VALUES (?, ?, 'TAB_SETTLEMENT', 500, 1, ?)`,
      crypto.randomUUID(), settlementId, chargeId,
    )
    await arm(true)

    try {
      const run = await runSweep()
      expect(run.anonymised).toBeGreaterThan(0)
      expect(isAnonymised(id)).toBe(true)
    }
    finally {
      await arm(false)
    }
  })

  test('a run anonymises no more than the configured cap', async () => {
    await setConfig('RETENTION_SWEEP_CAP', 1)
    const first = await inactiveAccount(-10)
    const second = await inactiveAccount(-10)

    try {
      const run = await runSweep()
      expect(run.wouldAnonymise.length).toBeLessThanOrEqual(1)
      expect(run.anonymisationsCappedAt).toBe(1)
      expect(run.wouldAnonymise.some(id => id === first || id === second)).toBe(true)
    }
    finally {
      await setConfig('RETENTION_SWEEP_CAP', 50)
    }
  })

  // The second cap (criterion 4). Warnings and anonymisations are bounded separately, so a run
  // full of warnings can no longer send an unbounded number of them.
  test('a run warns no more than the warning cap, and says it was capped', async () => {
    await setConfig('RETENTION_WARNING_CAP', 1)
    await inactiveAccount(20)
    await inactiveAccount(20)

    try {
      const run = await runSweep()
      expect(run.window + run.final).toBe(1)
      expect(run.warningsCappedAt).toBe(1)
      expect(run.anonymisationsCappedAt).toBeNull()
    }
    finally {
      await setConfig('RETENTION_WARNING_CAP', 100)
    }
  })
})

describe.skipIf(skip !== null)('armed, anonymisation actually happens (criteria 1, 5)', () => {
  test('an account past its threshold is anonymised once armed, and only once', async () => {
    const id = await inactiveAccount(-10)
    await arm(true)

    try {
      const run = await runSweep()
      expect(run.anonymised).toBeGreaterThan(0)
      expect(isAnonymised(id)).toBe(true)

      const second = await runSweep()
      expect(second.anonymised).toBe(0)
    }
    finally {
      await arm(false)
    }
  })

  test('a guest\'s three years is looser than a full account\'s two', async () => {
    const guest = await inactiveAccount(-10, 3)
    write('UPDATE users SET password = NULL, google_sub = NULL WHERE id = ?', guest)
    // 2.5 years inactive: past a full account's threshold, inside a guest's.
    const now = Math.floor(Date.now() / 1000)
    write('UPDATE users SET last_login_at = ? WHERE id = ?', now - Math.round(2.5 * YEAR_SECONDS), guest)
    await arm(true)

    try {
      await runSweep()
      expect(isAnonymised(guest)).toBe(false)
    }
    finally {
      await arm(false)
    }
  })
})

// The 29 August 2026 amendment to criterion 1. notify() already refuses the send; what these pin
// is that the sweep never takes the claim either, so the warning trail stays honest.
describe.skipIf(skip !== null)('nothing unproven or unclaimed is warned (criterion 1, amended)', () => {
  test('an unverified account inside the window is not warned, armed or not', async () => {
    const id = await inactiveAccount(20)
    write('UPDATE users SET verified = 0 WHERE id = ?', id)
    await arm(true)

    try {
      await runSweep()
      expect(claimsFor(id)).toEqual([])
    }
    finally {
      await arm(false)
    }
  })

  test('an unclaimed guest inside its window is not warned', async () => {
    const id = await inactiveAccount(20, 3)
    write('UPDATE users SET password = NULL, google_sub = NULL WHERE id = ?', id)
    await arm(true)

    try {
      await runSweep()
      expect(claimsFor(id)).toEqual([])
    }
    finally {
      await arm(false)
    }
  })

  test('a guest past its threshold is anonymised without ever being warned', async () => {
    const id = await inactiveAccount(-10, 3)
    write('UPDATE users SET password = NULL, google_sub = NULL WHERE id = ?', id)
    await arm(true)

    try {
      await runSweep()
      expect(isAnonymised(id)).toBe(true)
      expect(claimsFor(id)).toEqual([])
    }
    finally {
      await arm(false)
    }
  })
})

describe.skipIf(skip !== null)('the digest (criterion 5)', () => {
  // One claim per admin per day (0048): every earlier test in this file already ran a sweep
  // today, so by now the fresh claim this asserts has to be read back rather than counted again.
  test('a run always digests the IT Manager, whatever it found', () => {
    const sent = read<{ n: number }>('SELECT count(*) n FROM notification_log WHERE type = \'retention.digest\' AND status = \'SENT\'')
    expect(sent?.n ?? 0).toBeGreaterThan(0)
  })
})
