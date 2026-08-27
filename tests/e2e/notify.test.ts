import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { generatePassword, syntheticPerson } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

const password = generatePassword()

// The seed helper uses reserved domains, which the centre refuses by design, so the happy path
// needs one that looks deliverable. Ours has no mailbox, so a real send would bounce at us.
const E2E_DOMAIN = 'e2e.newtheatre.org.uk'

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

async function register(person: { email: string, name: string }): Promise<void> {
  await fetch(`${app.baseURL}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...person, password }),
  })
}

interface LogRow { type: string, status: string, error: string | null, subject: string | null }

function logFor(email: string): LogRow[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(`
      SELECT l.type, l.status, l.error, l.subject
      FROM notification_log l JOIN users u ON u.id = l.user_id
      WHERE u.email = ? ORDER BY l.rowid
    `).all(email) as LogRow[]
  }
  finally {
    database.close()
  }
}

function setEmail(email: string, to: string): void {
  const database = new Database(app.databaseFile)
  try {
    database.query('UPDATE users SET email = ? WHERE email = ?').run(to, email)
  }
  finally {
    database.close()
  }
}

function anonymise(email: string): void {
  const database = new Database(app.databaseFile)
  try {
    database.query('UPDATE users SET anonymised_at = 1 WHERE email = ?').run(email)
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('the notification centre (H-101, H-103, H-107)', () => {
  // Registration promises an email, so one must be attempted and its outcome recorded.
  test('registering records a send against the account', async () => {
    const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
    // The seed helper uses .invalid, which the centre refuses by design, so this one is real.
    const deliverable = { ...person, email: `probe-${Math.random().toString(36).slice(2)}@${E2E_DOMAIN}` }
    await register(deliverable)

    const log = logFor(deliverable.email)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ type: 'account.verify', status: 'SENT' })
    expect(log[0]!.subject).toBeTruthy()
  })

  // Every path that sends must refuse a placeholder, and the refusal is recorded rather than
  // silent (H-107 criteria 1 and 3).
  test('an undeliverable address is never handed to a provider, and says so', async () => {
    const person = syntheticPerson(Math.floor(Math.random() * 1_000_000) + 1)
    await register(person)

    const log = logFor(person.email)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ status: 'SKIPPED_UNDELIVERABLE', error: 'undeliverable-domain' })
  })

  test('an anonymised account is refused before its address is even considered', async () => {
    const person = syntheticPerson(Math.floor(Math.random() * 1_000_000) + 2)
    const deliverable = { ...person, email: `probe-${Math.random().toString(36).slice(2)}@${E2E_DOMAIN}` }
    await register(deliverable)
    anonymise(deliverable.email)

    await fetch(`${app.baseURL}/api/auth/verify/resend`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: deliverable.email }),
    })

    const log = logFor(deliverable.email)
    expect(log.at(-1)).toMatchObject({ status: 'SKIPPED_UNDELIVERABLE', error: 'anonymised' })
  })

  // The address is read at send time, not at enqueue, so one changed in between reaches the
  // new mailbox (H-101 criterion 5).
  test('the address is resolved when the message is sent, not when it is asked for', async () => {
    const person = syntheticPerson(Math.floor(Math.random() * 1_000_000) + 3)
    const first = { ...person, email: `first-${Math.random().toString(36).slice(2)}@${E2E_DOMAIN}` }
    await register(first)

    const moved = `second-${Math.random().toString(36).slice(2)}@${E2E_DOMAIN}`
    setEmail(first.email, moved)

    await fetch(`${app.baseURL}/api/auth/verify/resend`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: moved }),
    })

    expect(logFor(moved).at(-1)).toMatchObject({ type: 'account.verify', status: 'SENT' })
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
