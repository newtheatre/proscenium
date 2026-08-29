import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { CONFIG_KEYS } from '#shared/utils/config'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

const password = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
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

// The write path arrives with the settings surface; until then a test plants the row the reader
// is meant to find.
function override(key: string, value: unknown): void {
  const database = new Database(app.databaseFile)
  try {
    database.query('INSERT OR REPLACE INTO config (key, value, updated_by, updated_at) VALUES (?, ?, NULL, ?)')
      .run(key, JSON.stringify(value), Math.floor(Date.now() / 1000))
  }
  finally {
    database.close()
  }
}

function clearOverride(key: string): void {
  const database = new Database(app.databaseFile)
  try {
    database.query('DELETE FROM config WHERE key = ?').run(key)
  }
  finally {
    database.close()
  }
}

async function registerFresh(prefix: string): Promise<string> {
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = registrableAddress(prefix)
  await send('POST', '/api/auth/register', { email, name: person.name, password })
  markVerified(app, email)
  return email
}

describe.skipIf(skip !== null)('configuration is read, not compiled in (J-104)', () => {
  test('a key with no row reads its shipped default', async () => {
    const policy = await (await send('GET', '/api/auth/password-policy')).json() as { minLength: number }
    expect(policy.minLength).toBe(CONFIG_KEYS.PASSWORD_MIN_LENGTH.default)
  })

  // The criterion that matters: a changed value takes effect on the next request, with no deploy
  // and no restart (J-104 criterion 4).
  test('a changed value takes effect on the next request', async () => {
    const raised = CONFIG_KEYS.PASSWORD_MIN_LENGTH.default + 20
    override('PASSWORD_MIN_LENGTH', raised)
    try {
      const policy = await (await send('GET', '/api/auth/password-policy')).json() as { minLength: number }
      expect(policy.minLength).toBe(raised)
    }
    finally {
      clearOverride('PASSWORD_MIN_LENGTH')
    }
  })

  // Not just reported: enforced, at the write path the published rule describes.
  test('the write path enforces the changed value, and says which rule refused', async () => {
    const short = 'x'.repeat(CONFIG_KEYS.PASSWORD_MIN_LENGTH.default + 1)
    const raised = CONFIG_KEYS.PASSWORD_MIN_LENGTH.default + 20

    const before = await send('POST', '/api/auth/register', {
      email: registrableAddress('policy'), name: syntheticPerson(4).name, password: short,
    })
    expect(before.status).toBe(200)

    override('PASSWORD_MIN_LENGTH', raised)
    try {
      const after = await send('POST', '/api/auth/register', {
        email: registrableAddress('policy'), name: syntheticPerson(4).name, password: short,
      })
      expect(after.status).toBe(400)
      expect((await after.json()).statusMessage ?? '').toContain(String(raised))
    }
    finally {
      clearOverride('PASSWORD_MIN_LENGTH')
    }
  })

  test('the value goes back to the default when the row is removed', async () => {
    override('PASSWORD_MIN_LENGTH', CONFIG_KEYS.PASSWORD_MIN_LENGTH.default + 20)
    clearOverride('PASSWORD_MIN_LENGTH')

    const policy = await (await send('GET', '/api/auth/password-policy')).json() as { minLength: number }
    expect(policy.minLength).toBe(CONFIG_KEYS.PASSWORD_MIN_LENGTH.default)
  })

  // PRIVILEGED_ROLES is read on every guarded request, so this proves the reader reaches the
  // authorisation path and not only the handlers (A-112 criterion 4).
  test('which roles need a second factor is configuration, read live', async () => {
    const email = await registerFresh('privileged')
    const signedIn = await send('POST', '/api/auth/sign-in', { email, password })
    const cookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!
    expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', email, app.databaseFile, '--additional']).exitCode).toBe(0)

    const refused = await send('GET', '/api/admin/roles?userId=x', null, cookie)
    expect(refused.status).toBe(403)
    expect(JSON.stringify(await refused.json())).toMatch(/authenticator/i)

    override('PRIVILEGED_ROLES', [])
    try {
      const allowed = await send('GET', `/api/admin/roles?userId=${encodeURIComponent(email)}`, null, cookie)
      expect(allowed.status).toBe(200)
    }
    finally {
      clearOverride('PRIVILEGED_ROLES')
    }
  })

  // Enrolling restores the ordinary state, so the suite leaves nothing behind for the next case.
  test('the factor requirement returns when the roles do', async () => {
    const email = await registerFresh('restored')
    const signedIn = await send('POST', '/api/auth/sign-in', { email, password })
    const cookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!
    const { secret } = await (await send('POST', '/api/account/mfa/enrol', {}, cookie)).json() as { secret: string }
    const confirmed = await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, cookie)
    expect(confirmed.status).toBe(200)

    expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', email, app.databaseFile, '--additional']).exitCode).toBe(0)

    const answered = await send('POST', '/api/auth/mfa/challenge', {
      attemptId: (await (await send('POST', '/api/auth/sign-in', { email, password })).json() as { attemptId: string }).attemptId,
      code: await codeForStep(secret, stepFor(new Date()) + 1),
    })
    const fresh = (answered.headers.get('set-cookie') ?? '').split(';')[0]!

    const allowed = await send('GET', `/api/admin/roles?userId=${encodeURIComponent(email)}`, null, fresh)
    expect(allowed.status).toBe(200)
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
