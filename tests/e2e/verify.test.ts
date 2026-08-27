import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { generatePassword, syntheticPerson } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

const password = generatePassword()
const E2E_DOMAIN = 'e2e.newtheatre.org.uk'

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${app.baseURL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function withDatabase<T>(fn: (database: Database) => T, readonly = true): T {
  // bun:sqlite wants the flag present or absent, not set to false.
  const database = readonly ? new Database(app.databaseFile, { readonly: true }) : new Database(app.databaseFile)
  try {
    return fn(database)
  }
  finally {
    database.close()
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

interface TokenRow { token_hash: string, expires_at: number }

// bun:sqlite answers a missing row with null; undefined reads better at the call site.
function tokenFor(email: string): TokenRow | undefined {
  return withDatabase(database => database.query(`
    SELECT t.token_hash, t.expires_at FROM auth_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE u.email = ? AND t.kind = 'EMAIL_VERIFY'
  `).get(email) as TokenRow | null) ?? undefined
}

function verifiedFlag(email: string): number | undefined {
  return withDatabase(database =>
    (database.query('SELECT verified FROM users WHERE email = ?').get(email) as { verified: number } | undefined)?.verified)
}

// The plaintext exists only in the message by design, so a test cannot read it back. It plants
// a token it knows instead, which exercises every path the real one takes from here.
async function plantToken(email: string, plaintext: string, expiresInHours = 24): Promise<void> {
  const hash = await sha256(plaintext)
  withDatabase((database) => {
    const user = database.query('SELECT id FROM users WHERE email = ?').get(email) as { id: string }
    database.query('DELETE FROM auth_tokens WHERE user_id = ? AND kind = ?').run(user.id, 'EMAIL_VERIFY')
    database.query(`
      INSERT INTO auth_tokens (id, user_id, kind, token_hash, expires_at)
      VALUES (?, ?, 'EMAIL_VERIFY', ?, ?)
    `).run(crypto.randomUUID().replaceAll('-', ''), user.id, hash, Math.floor(Date.now() / 1000) + expiresInHours * 3600)
  }, false)
}

async function registerFresh(): Promise<string> {
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = `verify-${Math.random().toString(36).slice(2)}@${E2E_DOMAIN}`
  await post('/api/auth/register', { email, name: person.name, password })
  return email
}

describe.skipIf(skip !== null)('confirming an email address (A-102)', () => {
  test('registering leaves the account unverified with one outstanding token', async () => {
    const email = await registerFresh()
    expect(verifiedFlag(email)).toBe(0)
    expect(tokenFor(email)).toBeDefined()
  })

  // Stored hashed, so a leaked backup grants nobody a verified address (criterion 5).
  test('the token is stored as a hash, not as itself', async () => {
    const email = await registerFresh()
    const row = tokenFor(email)!
    expect(row.token_hash).toMatch(/^[a-f0-9]{64}$/)
  })

  test('it expires twenty four hours out', async () => {
    const email = await registerFresh()
    const hours = (tokenFor(email)!.expires_at * 1000 - Date.now()) / 3_600_000
    expect(hours).toBeGreaterThan(23.5)
    expect(hours).toBeLessThanOrEqual(24)
  })

  test('confirming marks the address verified and spends the token', async () => {
    const email = await registerFresh()
    const token = `plain-${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '')
    await plantToken(email, token)

    expect((await post('/api/auth/verify', { token })).status).toBe(200)
    expect(verifiedFlag(email)).toBe(1)
    expect(tokenFor(email)).toBeUndefined()
  })

  test('the same token cannot be spent twice', async () => {
    const email = await registerFresh()
    const token = `plain-${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '')
    await plantToken(email, token)

    expect((await post('/api/auth/verify', { token })).status).toBe(200)
    expect((await post('/api/auth/verify', { token })).status).toBe(410)
  })

  test('an expired token is refused, and removed rather than left looking usable', async () => {
    const email = await registerFresh()
    const token = `plain-${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '')
    await plantToken(email, token, -1)

    expect((await post('/api/auth/verify', { token })).status).toBe(410)
    expect(verifiedFlag(email)).toBe(0)
    expect(tokenFor(email)).toBeUndefined()
  })

  test('an invented token is refused exactly as a spent one is', async () => {
    expect((await post('/api/auth/verify', { token: 'f'.repeat(64) })).status).toBe(410)
  })

  // Asking again retires the older link, so only the newest one works (criterion 1).
  test('asking for a new link retires the old one', async () => {
    const email = await registerFresh()
    const first = `plain-${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '')
    await plantToken(email, first)

    await post('/api/auth/verify/resend', { email })

    expect((await post('/api/auth/verify', { token: first })).status).toBe(410)
    expect(verifiedFlag(email)).toBe(0)
    expect(tokenFor(email)).toBeDefined()
  })

  // Enumeration-safe: the same answer whether or not the address has an account (criterion 3).
  test('resending is indistinguishable for an address with no account', async () => {
    const known = await registerFresh()
    const forKnown = await post('/api/auth/verify/resend', { email: known })
    const forStranger = await post('/api/auth/verify/resend', { email: `nobody-${Math.random()}@${E2E_DOMAIN}` })

    expect(forKnown.status).toBe(forStranger.status)
    expect(await forKnown.text()).toBe(await forStranger.text())
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
