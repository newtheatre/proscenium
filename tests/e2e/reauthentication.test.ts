import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// A-128: what a session may reassert with is read fresh from the account each time, never
// inherited from how the session began or cached from sign-in.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, cookie?: string): Promise<Response> =>
  request(app, method, path, body, cookie)

// Every route that reseals the session, confirming a factor or reasserting one, answers with a
// fresh cookie; the caller adopts it or its next request reads the session it replaced.
function cookieFrom(response: Response, fallback: string): string {
  return (response.headers.get('set-cookie') ?? '').split(';')[0] || fallback
}

function auditFor(email: string, action: string): { detail: string | null } | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(`
      SELECT l.detail FROM audit_log l JOIN users u ON u.id = l.actor_id
      WHERE u.email = ? AND l.action = ? ORDER BY l.created_at DESC LIMIT 1
    `).get(email, action) as { detail: string | null } | undefined
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('what the modal may offer (criteria 1 to 4)', () => {
  test('a password-only account is offered a password, with no code', async () => {
    const password = generatePassword()
    const member = await registerMember(app, 'reauth-plain', password)

    const answer = await (await send('GET', '/api/account/reauthenticate', undefined, member.cookie)).json() as {
      options: { kind: string, secondFactor?: boolean }[]
    }
    expect(answer.options).toEqual([{ kind: 'password', secondFactor: false }])
  })

  test('an account with a confirmed authenticator is asked for its code too', async () => {
    const password = generatePassword()
    const member = await registerMember(app, 'reauth-totp', password)
    const { secret } = await (await send('POST', '/api/account/mfa/enrol', {}, member.cookie)).json() as { secret: string }
    // Confirming a factor ends every other session, this one included, and reissues it: the
    // response carries the only cookie now valid (A-109 criterion 3).
    const confirmed = await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, member.cookie)
    const cookie = cookieFrom(confirmed, member.cookie)

    const answer = await (await send('GET', '/api/account/reauthenticate', undefined, cookie)).json() as {
      options: { kind: string, secondFactor?: boolean }[]
    }
    expect(answer.options).toEqual([{ kind: 'password', secondFactor: true }])
  })

  // Criterion 2, against the real session and the real account: a passkey registered on this
  // account does not appear as an option for a session that signed in with a password.
  test('a password session does not inherit a passkey the account also owns', async () => {
    const password = generatePassword()
    const member = await registerMember(app, 'reauth-mixed', password)

    const database = new Database(app.databaseFile)
    try {
      database.query(`
        INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, backed_up)
        VALUES (?, ?, ?, ?, 0, 0)
      `).run('pk-fixture', member.id, `cred-${member.id}`, 'stub-public-key')
    }
    finally {
      database.close()
    }

    const answer = await (await send('GET', '/api/account/reauthenticate', undefined, member.cookie)).json() as {
      options: { kind: string, secondFactor?: boolean }[]
    }
    expect(answer.options).toEqual([{ kind: 'password', secondFactor: false }])
  })
})

describe.skipIf(skip !== null)('answering with a password (criterion 3)', () => {
  test('the right password reasserts and is audited, with no free text', async () => {
    const password = generatePassword()
    const member = await registerMember(app, 'reassert-ok', password)

    const response = await send('POST', '/api/account/reauthenticate/password', { password }, member.cookie)
    expect(response.status).toBe(200)

    const entry = auditFor(member.email, 'session.reauthenticated')
    expect(JSON.parse(entry!.detail!)).toEqual({ factor: 'password' })
  })

  test('the wrong password is refused', async () => {
    const password = generatePassword()
    const member = await registerMember(app, 'reassert-bad', password)

    const response = await send('POST', '/api/account/reauthenticate/password', { password: `${password}-nope` }, member.cookie)
    expect(response.status).toBe(401)
  })

  test('a confirmed authenticator is required alongside a matching password', async () => {
    const password = generatePassword()
    const member = await registerMember(app, 'reassert-totp', password)
    const { secret } = await (await send('POST', '/api/account/mfa/enrol', {}, member.cookie)).json() as { secret: string }
    const confirmed = await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, member.cookie)
    const cookie = cookieFrom(confirmed, member.cookie)

    const noCode = await send('POST', '/api/account/reauthenticate/password', { password }, cookie)
    expect(noCode.status).toBe(401)

    // The enrolment step was already spent confirming it, so the next one answers this (A-109).
    const withCode = await send('POST', '/api/account/reauthenticate/password', {
      password,
      code: await codeForStep(secret, stepFor(new Date()) + 1),
    }, cookie)
    expect(withCode.status).toBe(200)
    expect(JSON.parse(auditFor(member.email, 'session.reauthenticated')!.detail!)).toEqual({ factor: 'totp' })
  })
})

describe.skipIf(skip !== null)('a stale session is refused and the modal\'s success unsticks it (criteria 5 and 6)', () => {
  test('mfa/enrol refuses a session outside the window, and reasserting lets it through', async () => {
    const admin = await adminSession(app)
    await send('PUT', '/api/admin/config/REAUTH_WINDOW_MINUTES', { value: 1 }, admin.cookie)

    try {
      const password = generatePassword()
      const member = await registerMember(app, 'reassert-stale', password)

      // Just past the one-minute window this test set: the same comparison isFresh is unit
      // tested against directly, proved here end to end through the real gate once.
      await Bun.sleep(61_000)

      const refused = await send('POST', '/api/account/mfa/enrol', {}, member.cookie)
      expect(refused.status).toBe(401)
      const { data } = await refused.json() as { data: { reauthenticate?: boolean } }
      expect(data.reauthenticate).toBe(true)

      const reasserted = await send('POST', '/api/account/reauthenticate/password', { password }, member.cookie)
      expect(reasserted.status).toBe(200)
      const cookie = cookieFrom(reasserted, member.cookie)

      const retried = await send('POST', '/api/account/mfa/enrol', {}, cookie)
      expect(retried.status).toBe(200)
    }
    finally {
      await send('PUT', '/api/admin/config/REAUTH_WINDOW_MINUTES', { value: 10 }, admin.cookie)
    }
  }, CASE_TIMEOUT_MS)
})
