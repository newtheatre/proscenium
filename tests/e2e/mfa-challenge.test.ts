import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { markVerified } from '#tests/helpers/accounts'
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

function send(method: string, path: string, body: unknown, cookie?: string): Promise<Response> {
  const carriesBody = method !== 'GET' && method !== 'HEAD'
  return fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(carriesBody ? { body: JSON.stringify(body ?? {}) } : {}),
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

interface Member { email: string, cookie: string, secret: string, codes: string[] }

async function memberWithFactor(): Promise<Member> {
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = `chal-${Math.random().toString(36).slice(2)}@${E2E_DOMAIN}`
  await send('POST', '/api/auth/register', { email, name: person.name, password })
  markVerified(app, email)

  const signedIn = await send('POST', '/api/auth/sign-in', { email, password })
  const cookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!

  const { secret } = await (await send('POST', '/api/account/mfa/enrol', {}, cookie)).json() as { secret: string }
  const confirmed = await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, cookie)
  const { recoveryCodes } = await confirmed.json() as { recoveryCodes: string[] }

  return { email, cookie: (confirmed.headers.get('set-cookie') ?? '').split(';')[0]!, secret, codes: recoveryCodes }
}

// The step used during enrolment is spent, so the challenge needs the next one.
async function nextCode(secret: string): Promise<string> {
  return codeForStep(secret, stepFor(new Date()) + 1)
}

describe.skipIf(skip !== null)('answering the challenge (A-111)', () => {
  test('a proven password with a factor gives an attempt, not a session', async () => {
    const member = await memberWithFactor()
    const response = await send('POST', '/api/auth/sign-in', { email: member.email, password })

    expect(response.status).toBe(200)
    const body = await response.json() as { mfaRequired: boolean, attemptId: string }
    expect(body.mfaRequired).toBe(true)
    expect(body.attemptId).toBeTruthy()

    // A sealed cookie may still be set: what matters is that it signs nobody in. Checking the
    // header alone would pass on an empty session and fail on a harmless one.
    const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]!
    const session = await (await fetch(`${app.baseURL}/api/auth/session`, { headers: { cookie } })).json() as { signedIn: boolean }
    expect(session.signedIn).toBe(false)
  })

  test('an account with no factor still signs in directly', async () => {
    const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
    const email = `plain-${Math.random().toString(36).slice(2)}@${E2E_DOMAIN}`
    await send('POST', '/api/auth/register', { email, name: person.name, password })
    markVerified(app, email)

    const response = await send('POST', '/api/auth/sign-in', { email, password })
    expect((await response.json() as { mfaRequired: boolean }).mfaRequired).toBe(false)
    expect(response.headers.get('set-cookie') ?? '').toContain('nnt-session')
  })

  test('a valid code completes the attempt and seals the session', async () => {
    const member = await memberWithFactor()
    const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email: member.email, password })).json() as { attemptId: string }

    const response = await send('POST', '/api/auth/mfa/challenge', { attemptId, code: await nextCode(member.secret) })
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie') ?? '').toContain('nnt-session')
  })

  // A typo costs the code, not the password step (criterion 2).
  test('a wrong code returns a fresh attempt rather than sending the user back', async () => {
    const member = await memberWithFactor()
    const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email: member.email, password })).json() as { attemptId: string }

    const refused = await send('POST', '/api/auth/mfa/challenge', { attemptId, code: '000000' })
    expect(refused.status).toBe(401)

    const { data } = await refused.json() as { data: { attemptId: string } }
    expect(data.attemptId).toBeTruthy()
    expect(data.attemptId).not.toBe(attemptId)

    const second = await send('POST', '/api/auth/mfa/challenge', { attemptId: data.attemptId, code: await nextCode(member.secret) })
    expect(second.status).toBe(200)
  })

  test('the spent attempt cannot be reused', async () => {
    const member = await memberWithFactor()
    const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email: member.email, password })).json() as { attemptId: string }

    expect((await send('POST', '/api/auth/mfa/challenge', { attemptId, code: await nextCode(member.secret) })).status).toBe(200)
    expect((await send('POST', '/api/auth/mfa/challenge', { attemptId, code: await nextCode(member.secret) })).status).toBe(410)
  })

  test('an expired attempt sends the user back to the first step', async () => {
    const member = await memberWithFactor()
    const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email: member.email, password })).json() as { attemptId: string }

    withDatabase((database) => {
      database.query('UPDATE mfa_attempts SET expires_at = ? WHERE id = ?').run(Math.floor(Date.now() / 1000) - 1, attemptId)
    }, false)

    expect((await send('POST', '/api/auth/mfa/challenge', { attemptId, code: await nextCode(member.secret) })).status).toBe(410)
  })

  // An entry written outside the batch carrying its change can exist for a change that failed,
  // or the reverse (J-101 criterion 1). Attempt and entry now arrive together or not at all.
  test('an attempt and its audit entry arrive together', async () => {
    const member = await memberWithFactor()
    const id = withDatabase(database =>
      (database.query('SELECT id FROM users WHERE email = ?').get(member.email) as { id: string }).id)

    const entries = (): number => withDatabase(database =>
      (database.query('SELECT count(*) AS n FROM audit_log WHERE action = ? AND target = ?')
        .get('mfa.challenged', `user:${id}`) as { n: number }).n)

    const attempts = (): number => withDatabase(database =>
      (database.query('SELECT count(*) AS n FROM mfa_attempts WHERE user_id = ?').get(id) as { n: number }).n)

    const before = entries()
    const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email: member.email, password })).json() as { attemptId: string }

    expect(attemptId).toBeTruthy()
    expect(entries()).toBe(before + 1)
    expect(attempts()).toBe(1)

    // A wrong code spends the attempt and opens a fresh one, so the pairing has to hold twice.
    await send('POST', '/api/auth/mfa/challenge', { attemptId, code: '000000' })
    expect(entries()).toBe(before + 2)
    expect(attempts()).toBe(1)
  })

  // Criterion 4: an attempt that nobody answered is a row, and the nightly task removes it.
  test('the daily sweep removes lapsed attempts', async () => {
    const member = await memberWithFactor()
    const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email: member.email, password })).json() as { attemptId: string }

    withDatabase((database) => {
      database.query('UPDATE mfa_attempts SET expires_at = ? WHERE id = ?').run(Math.floor(Date.now() / 1000) - 1, attemptId)
    }, false)

    const swept = await fetch(`${app.baseURL}/_nitro/tasks/daily:sweeps`, { method: 'POST' })
    expect(swept.status).toBe(200)

    const left = withDatabase(database => database.query('SELECT id FROM mfa_attempts WHERE id = ?').get(attemptId))
    expect(left).toBeNull()
  })

  // A recovery code answers the challenge, once, and the count remaining is recorded.
  test('a recovery code answers the challenge and is then spent', async () => {
    const member = await memberWithFactor()
    const code = member.codes[0]!

    const first = await (await send('POST', '/api/auth/sign-in', { email: member.email, password })).json() as { attemptId: string }
    const used = await send('POST', '/api/auth/mfa/challenge', { attemptId: first.attemptId, code })
    expect(used.status).toBe(200)
    expect((await used.json() as { recoveryCodesRemaining: number }).recoveryCodesRemaining).toBe(member.codes.length - 1)

    const second = await (await send('POST', '/api/auth/sign-in', { email: member.email, password })).json() as { attemptId: string }
    expect((await send('POST', '/api/auth/mfa/challenge', { attemptId: second.attemptId, code })).status).toBe(401)
  })

  // Never a first credential: a recovery code is not a password (A-110 criterion 5).
  test('a recovery code is not accepted as a password', async () => {
    const member = await memberWithFactor()
    expect((await send('POST', '/api/auth/sign-in', { email: member.email, password: member.codes[1]! })).status).toBe(401)
  })
})

describe.skipIf(skip !== null)('privileged roles require a factor (A-112)', () => {
  test('a privileged account without a factor is refused, and told where to go', async () => {
    const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
    const email = `priv-${Math.random().toString(36).slice(2)}@${E2E_DOMAIN}`
    await send('POST', '/api/auth/register', { email, name: person.name, password })
    markVerified(app, email)

    const signedIn = await send('POST', '/api/auth/sign-in', { email, password })
    const cookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!

    expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', email, app.databaseFile, '--additional']).exitCode).toBe(0)

    const refused = await send('GET', `/api/admin/roles?userId=x`, null, cookie)
    expect(refused.status).toBe(403)
    expect(JSON.stringify(await refused.json())).toMatch(/authenticator/i)
  })

  test('the same account works once a factor is confirmed', async () => {
    const member = await memberWithFactor()
    expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', member.email, app.databaseFile, '--additional']).exitCode).toBe(0)

    const signedIn = await send('POST', '/api/auth/sign-in', { email: member.email, password })
    const { attemptId } = await signedIn.json() as { attemptId: string }
    const answered = await send('POST', '/api/auth/mfa/challenge', { attemptId, code: await nextCode(member.secret) })
    const cookie = (answered.headers.get('set-cookie') ?? '').split(';')[0]!

    const allowed = await fetch(`${app.baseURL}/api/admin/roles?userId=${encodeURIComponent(member.email)}`, { headers: { cookie } })
    expect(allowed.status).toBe(200)
  })

  // Giving up the factor while the role needs it would lock the surface, so it is refused.
  test('the factor cannot be removed while a privileged role needs it', async () => {
    const member = await memberWithFactor()
    expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', member.email, app.databaseFile, '--additional']).exitCode).toBe(0)

    const signedIn = await send('POST', '/api/auth/sign-in', { email: member.email, password })
    const { attemptId } = await signedIn.json() as { attemptId: string }
    const answered = await send('POST', '/api/auth/mfa/challenge', { attemptId, code: await nextCode(member.secret) })
    const cookie = (answered.headers.get('set-cookie') ?? '').split(';')[0]!

    expect((await send('DELETE', '/api/account/mfa', null, cookie)).status).toBe(409)
  })

  test('an unprivileged account may remove its factor', async () => {
    const member = await memberWithFactor()
    expect((await send('DELETE', '/api/account/mfa', null, member.cookie)).status).toBe(200)

    const remaining = withDatabase(database =>
      (database.query('SELECT count(*) n FROM recovery_codes r JOIN users u ON u.id = r.user_id WHERE u.email = ?')
        .get(member.email) as { n: number }).n)
    expect(remaining).toBe(0)
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
