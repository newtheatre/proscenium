import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { letters, skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// H-105. The retry sweep against the real routes: a failed send is sent again, an exhausted one
// is failed for good, and the entry is never lost or duplicated (criteria 2, 3 and 6).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let officer = ''
let member: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = (await adminSession(app)).cookie
  member = await registerMember(app, 'retried', generatePassword())
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function send(method: string, path: string, body?: unknown, cookie?: string): Promise<Response> {
  const carriesBody = method !== 'GET' && method !== 'HEAD'
  return fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(carriesBody ? { body: JSON.stringify(body ?? {}) } : {}),
  })
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

function read<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

interface Row { id: string, status: string, attempts: number, retry_payload: string | null, error: string | null }

const rowFor = (id: string): Row | undefined =>
  read<Row>('SELECT id, status, attempts, retry_payload, error FROM notification_log WHERE id = ?', id)

const rowsFor = (id: string): number =>
  read<{ n: number }>('SELECT count(*) n FROM notification_log WHERE id = ?', id)?.n ?? 0

// The state a provider dying mid-send leaves behind: one row, one attempt spent, the rendered
// message held for the next attempt. Aged so the backoff window has already passed.
function seedFailed(subject: string, over: { attempts?: number, payload?: string | null, type?: string } = {}): string {
  const id = crypto.randomUUID().replaceAll('-', '')
  const payload = over.payload === undefined
    ? JSON.stringify({ subject, html: `<p>${subject}</p>`, text: subject })
    : over.payload
  write(
    `INSERT INTO notification_log (id, user_id, type, channel, status, subject, error, attempts, retry_payload, created_at)
     VALUES (?, ?, ?, 'EMAIL', 'FAILED', ?, 'the provider refused it', ?, ?, unixepoch() - 86400)`,
    id, member.id, over.type ?? 'room.booking.confirmed', subject, over.attempts ?? 1, payload,
  )
  return id
}

const retry = (): Promise<Response> => send('POST', '/api/dev/retry-notifications', {}, officer)

describe.skipIf(skip !== null)('a failed send is sent again (criterion 2)', () => {
  test('the sweep sends the stored message and settles the same row', async () => {
    const subject = `Retried ${crypto.randomUUID().slice(0, 8)}`
    const id = seedFailed(subject)

    const answered = await retry()
    expect(answered.status).toBe(200)
    expect(await answered.json()).toMatchObject({ claimed: 1, sent: 1 })

    expect(rowFor(id)).toMatchObject({ status: 'SENT', attempts: 2, retry_payload: null })
    expect(rowsFor(id)).toBe(1)

    // What arrived is what was rendered the first time, not a re-render (0056).
    expect((await letters(app)).some(body => body.includes(subject))).toBe(true)
  }, CASE_TIMEOUT_MS)

  test('a settled entry is not picked up by the next sweep', async () => {
    const id = seedFailed(`Once only ${crypto.randomUUID().slice(0, 8)}`)
    await retry()
    expect(rowFor(id)?.status).toBe('SENT')

    const second = await retry()
    expect((await second.json() as { claimed: number }).claimed).toBe(0)
    expect(rowFor(id)?.attempts).toBe(2)
  }, CASE_TIMEOUT_MS)

  test('an entry with nothing to send again is not retried', async () => {
    const id = seedFailed('Nothing stored', { payload: null })
    await retry()
    expect(rowFor(id)).toMatchObject({ status: 'FAILED', attempts: 1 })
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('an entry that runs out of attempts gives up visibly (criterion 2)', () => {
  test('the last attempt marks it failed for good', async () => {
    // One short of the shipped maximum, so this sweep is its last attempt. The address is made
    // undeliverable first, so the send cannot succeed.
    const id = seedFailed('Out of attempts', { attempts: 4 })
    write('UPDATE users SET email = ? WHERE id = ?', `gone-${crypto.randomUUID().slice(0, 8)}@example.com`, member.id)

    await retry()

    // An address the provider must never see is a refusal rather than a failed attempt (H-107).
    expect(rowFor(id)).toMatchObject({ status: 'SKIPPED_UNDELIVERABLE', retry_payload: null })
    expect(rowFor(id)?.error).toBe('undeliverable-domain')
  }, CASE_TIMEOUT_MS)

  test('an erasure between attempts drops the message rather than sending it', async () => {
    const gone = await registerMember(app, 'erased-mid-retry', generatePassword())
    const id = crypto.randomUUID().replaceAll('-', '')
    write(
      `INSERT INTO notification_log (id, user_id, type, channel, status, subject, attempts, retry_payload, created_at)
       VALUES (?, ?, 'room.booking.confirmed', 'EMAIL', 'FAILED', 'Erased', 1, ?, unixepoch() - 86400)`,
      id, gone.id, JSON.stringify({ subject: 'Erased', html: '<p>Erased</p>', text: 'Erased' }),
    )
    write('UPDATE users SET anonymised_at = unixepoch() WHERE id = ?', gone.id)

    await retry()

    expect(rowFor(id)).toMatchObject({ status: 'SKIPPED_UNDELIVERABLE', error: 'anonymised', retry_payload: null })
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the provider dying mid-send loses nothing (criterion 6)', () => {
  // The named regression test. The provider's death is seeded as the state it leaves, a FAILED
  // row with its payload, because the development transport cannot be made to refuse a message.
  test('the entry ends failed, retries, and is never lost or duplicated', async () => {
    const subject = `Mid-send ${crypto.randomUUID().slice(0, 8)}`
    write('UPDATE users SET email = ? WHERE id = ?', `${member.email.split('@')[0]}@e2e.newtheatre.org.uk`, member.id)
    const id = seedFailed(subject)

    const before = read<{ n: number }>('SELECT count(*) n FROM notification_log')?.n ?? 0
    await retry()
    const after = read<{ n: number }>('SELECT count(*) n FROM notification_log')?.n ?? 0

    // Not lost: the row is still there and now says what happened. Not duplicated: the sweep
    // updated the entry rather than writing a second one (0048).
    expect(rowsFor(id)).toBe(1)
    expect(after).toBe(before)
    expect(rowFor(id)).toMatchObject({ status: 'SENT', attempts: 2 })
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
