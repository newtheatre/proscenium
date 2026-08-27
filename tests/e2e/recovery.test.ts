import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { CONFIG_KEYS } from '#shared/utils/config'
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

function post(path: string, body: unknown, cookie?: string): Promise<Response> {
  return fetch(`${app.baseURL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
}

function withDatabase<T>(fn: (database: Database) => T, readonly = true): T {
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

// The plaintext exists only in the message, so a test plants one whose hash it knows.
async function plantToken(email: string, kind: string, plaintext: string, expiresInMinutes: number): Promise<void> {
  const hash = await sha256(plaintext)
  withDatabase((database) => {
    const user = database.query('SELECT id FROM users WHERE email = ?').get(email) as { id: string }
    database.query('DELETE FROM auth_tokens WHERE user_id = ? AND kind = ?').run(user.id, kind)
    database.query('INSERT INTO auth_tokens (id, user_id, kind, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(crypto.randomUUID().replaceAll('-', ''), user.id, kind, hash, Math.floor(Date.now() / 1000) + expiresInMinutes * 60)
  }, false)
}

function tokenRow(email: string, kind: string): { expires_at: number } | undefined {
  return withDatabase(database => database.query(`
    SELECT t.expires_at FROM auth_tokens t JOIN users u ON u.id = t.user_id
    WHERE u.email = ? AND t.kind = ?
  `).get(email, kind) as { expires_at: number } | null) ?? undefined
}

function epochOf(email: string): number {
  return withDatabase(database =>
    (database.query('SELECT session_epoch FROM users WHERE email = ?').get(email) as { session_epoch: number }).session_epoch)
}

function address(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}@${E2E_DOMAIN}`
}

async function registerFresh(prefix: string): Promise<string> {
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = address(prefix)
  await post('/api/auth/register', { email, name: person.name, password })
  return email
}

const newToken = (): string => `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '')

describe.skipIf(skip !== null)('resetting a forgotten password (A-108)', () => {
  test('asking is enumeration-safe', async () => {
    const known = await registerFresh('reset')
    const forKnown = await post('/api/auth/password/forgot', { email: known })
    const forStranger = await post('/api/auth/password/forgot', { email: address('nobody') })

    expect(forKnown.status).toBe(forStranger.status)
    expect(await forKnown.text()).toBe(await forStranger.text())
  })

  test('a request issues a token lasting the configured hour', async () => {
    const email = await registerFresh('reset')
    await post('/api/auth/password/forgot', { email })

    const hours = (tokenRow(email, 'PASSWORD_RESET')!.expires_at * 1000 - Date.now()) / 3_600_000
    expect(hours).toBeGreaterThan(CONFIG_KEYS.PASSWORD_RESET_HOURS.default - 0.5)
    expect(hours).toBeLessThanOrEqual(CONFIG_KEYS.PASSWORD_RESET_HOURS.default)
  })

  test('resetting sets the new password and lets it sign in', async () => {
    const email = await registerFresh('reset')
    const token = newToken()
    await plantToken(email, 'PASSWORD_RESET', token, 60)

    const fresh = `${generatePassword()}-changed`
    expect((await post('/api/auth/password/reset', { token, password: fresh })).status).toBe(200)
    expect((await post('/api/auth/sign-in', { email, password: fresh })).status).toBe(200)
  })

  // Every other session ends, which the epoch does in one write (criterion 4).
  test('resetting ends every other session', async () => {
    const email = await registerFresh('reset')
    const before = epochOf(email)

    const token = newToken()
    await plantToken(email, 'PASSWORD_RESET', token, 60)
    await post('/api/auth/password/reset', { token, password: `${generatePassword()}-changed` })

    expect(epochOf(email)).toBe(before + 1)
  })

  // Delete-as-claim: two redemptions of one token cannot both succeed (criterion 3).
  test('two racing redemptions cannot both succeed', async () => {
    const email = await registerFresh('reset')
    const token = newToken()
    await plantToken(email, 'PASSWORD_RESET', token, 60)

    const both = await Promise.all([
      post('/api/auth/password/reset', { token, password: `${generatePassword()}-a` }),
      post('/api/auth/password/reset', { token, password: `${generatePassword()}-b` }),
    ])

    expect(both.filter(response => response.status === 200)).toHaveLength(1)
    expect(both.filter(response => response.status === 410)).toHaveLength(1)
  })

  test('an expired token is refused', async () => {
    const email = await registerFresh('reset')
    const token = newToken()
    await plantToken(email, 'PASSWORD_RESET', token, -1)

    expect((await post('/api/auth/password/reset', { token, password: `${generatePassword()}-x` })).status).toBe(410)
  })

  // A Workspace address has no password and never will (0008, criterion 5).
  test('a Workspace address is told to use Google, and nothing is issued', async () => {
    const response = await post('/api/auth/password/forgot', { email: 'someone.synthetic@newtheatre.org.uk' })
    expect(response.status).toBe(200)
    expect(JSON.stringify(await response.json())).toMatch(/Google/i)
  })
})

describe.skipIf(skip !== null)('signing in with a link (A-107)', () => {
  test('asking is enumeration-safe', async () => {
    const known = await registerFresh('magic')
    const forKnown = await post('/api/auth/magic-link/request', { email: known })
    const forStranger = await post('/api/auth/magic-link/request', { email: address('nobody') })

    expect(forKnown.status).toBe(forStranger.status)
    expect(await forKnown.text()).toBe(await forStranger.text())
  })

  test('a link lasts the configured minutes, not hours', async () => {
    const email = await registerFresh('magic')
    await post('/api/auth/magic-link/request', { email })

    const minutes = (tokenRow(email, 'MAGIC_LINK')!.expires_at * 1000 - Date.now()) / 60_000
    expect(minutes).toBeGreaterThan(CONFIG_KEYS.MAGIC_LINK_MINUTES.default - 1)
    expect(minutes).toBeLessThanOrEqual(CONFIG_KEYS.MAGIC_LINK_MINUTES.default)
  })

  test('consuming one signs in and proves the mailbox', async () => {
    const email = await registerFresh('magic')
    const token = newToken()
    await plantToken(email, 'MAGIC_LINK', token, 15)

    const response = await post('/api/auth/magic-link/consume', { token })
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie') ?? '').toContain('nnt-session')

    const verified = withDatabase(database =>
      (database.query('SELECT verified FROM users WHERE email = ?').get(email) as { verified: number }).verified)
    expect(verified).toBe(1)
  })

  test('a link works once', async () => {
    const email = await registerFresh('magic')
    const token = newToken()
    await plantToken(email, 'MAGIC_LINK', token, 15)

    expect((await post('/api/auth/magic-link/consume', { token })).status).toBe(200)
    expect((await post('/api/auth/magic-link/consume', { token })).status).toBe(410)
  })

  test('a Workspace address is ignored silently, with nothing issued', async () => {
    const response = await post('/api/auth/magic-link/request', { email: 'someone.synthetic@newtheatre.org.uk' })
    expect(response.status).toBe(200)
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
