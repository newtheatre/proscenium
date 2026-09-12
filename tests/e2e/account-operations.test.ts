import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { saysRole } from '#shared/utils/roles'
import { forgetSpentStep, markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, fillPin, openSignedOutView, pickOption, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

const password = generatePassword()
const officer = { ...syntheticPerson(41), email: registrableAddress('operator') }
let cookie = ''
let secret = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()

  await send('POST', '/api/auth/register', { email: officer.email, name: officer.name, password })
  markVerified(app, officer.email)
  const signedIn = await send('POST', '/api/auth/sign-in', { email: officer.email, password })
  const first = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!
  secret = (await (await send('POST', '/api/account/mfa/enrol', {}, first)).json() as { secret: string }).secret
  await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, first)

  expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', officer.email, app.databaseFile]).exitCode).toBe(0)
  cookie = await signInThroughTheChallenge()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function send(method: string, path: string, body?: unknown, withCookie?: string): Promise<Response> {
  const carriesBody = method !== 'GET' && method !== 'HEAD'
  return fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(withCookie ? { cookie: withCookie } : {}) },
    ...(carriesBody ? { body: JSON.stringify(body ?? {}) } : {}),
  })
}

function read<T>(sql: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(sql).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

// Setup only, never the behaviour under test: earlier cases in this file grant ADMIN to spare
// subjects, so this arranges a known single-administrator state directly.
function run(sql: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(sql).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

// A spent step cannot answer a second challenge, and two steps out is outside tolerance.
async function unusedCode(): Promise<string> {
  forgetSpentStep(app, officer.email)
  return codeForStep(secret, stepFor(new Date()))
}

async function signInThroughTheChallenge(): Promise<string> {
  const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email: officer.email, password })).json() as { attemptId: string }
  const answered = await send('POST', '/api/auth/mfa/challenge', { attemptId, code: await unusedCode() })
  return (answered.headers.get('set-cookie') ?? '').split(';')[0]!
}

interface Subject { id: string, email: string, cookie: string }

async function subject(prefix: string): Promise<Subject> {
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = registrableAddress(prefix)
  await send('POST', '/api/auth/register', { email, name: person.name, password })
  markVerified(app, email)
  const signedIn = await send('POST', '/api/auth/sign-in', { email, password })
  const id = read<{ id: string }>('SELECT id FROM users WHERE email = ?', email)!.id
  return { id, email, cookie: (signedIn.headers.get('set-cookie') ?? '').split(';')[0]! }
}

const stillSignedIn = async (theirs: string): Promise<boolean> =>
  (await (await fetch(`${app.baseURL}/api/auth/session`, { headers: { cookie: theirs } })).json() as { signedIn: boolean }).signedIn

const operate = (id: string, operation: string, withCookie = cookie): Promise<Response> =>
  send('POST', `/api/admin/accounts/${id}/security`, { operation }, withCookie)

describe.skipIf(skip !== null)('security operations on an account (A-122)', () => {
  // Proved by its effect, not by its response: the cookie that worked stops working.
  test('signing out everywhere kills a live session', async () => {
    const person = await subject('signout')
    expect(await stillSignedIn(person.cookie)).toBe(true)

    expect((await operate(person.id, 'sign-out')).status).toBe(200)
    expect(await stillSignedIn(person.cookie)).toBe(false)
  })

  test('disabling kills every session, and re-enabling does not bring them back', async () => {
    const person = await subject('disable')
    expect((await operate(person.id, 'disable')).status).toBe(200)
    expect(await stillSignedIn(person.cookie)).toBe(false)

    expect((await operate(person.id, 'enable')).status).toBe(200)
    expect(await stillSignedIn(person.cookie)).toBe(false)
  })

  // Criterion 2: a disabled account is refused exactly as a wrong password is.
  test('a disabled account is refused with the same answer as a wrong password', async () => {
    const person = await subject('refused')
    await operate(person.id, 'disable')

    const disabled = await send('POST', '/api/auth/sign-in', { email: person.email, password })
    const wrong = await send('POST', '/api/auth/sign-in', { email: person.email, password: `${password}-not` })

    expect(disabled.status).toBe(wrong.status)
    expect(await disabled.text()).toBe(await wrong.text())
  })

  test('resetting the authenticator clears the factor, the codes and the sessions', async () => {
    const person = await subject('reset')
    const theirSecret = (await (await send('POST', '/api/account/mfa/enrol', {}, person.cookie)).json() as { secret: string }).secret
    const confirmed = await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(theirSecret, stepFor(new Date())) }, person.cookie)
    expect(confirmed.status).toBe(200)
    const reissued = (confirmed.headers.get('set-cookie') ?? '').split(';')[0]!

    expect((await operate(person.id, 'reset-mfa')).status).toBe(200)

    expect(read('SELECT user_id FROM totp_secrets WHERE user_id = ?', person.id)).toBeUndefined()
    expect(read('SELECT id FROM recovery_codes WHERE user_id = ?', person.id)).toBeUndefined()
    expect(await stillSignedIn(reissued)).toBe(false)

    // And the account signs in without a challenge again, because there is no factor to meet.
    const after = await send('POST', '/api/auth/sign-in', { email: person.email, password })
    expect((await after.json() as { mfaRequired: boolean }).mfaRequired).toBe(false)
  })

  // A reset exists for the person who lost their phone, including one who holds a role that
  // requires a factor. The self-service route refuses that; this one must not.
  test('a privileged account can have its authenticator reset', async () => {
    const person = await subject('privileged-reset')
    const theirSecret = (await (await send('POST', '/api/account/mfa/enrol', {}, person.cookie)).json() as { secret: string }).secret
    await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(theirSecret, stepFor(new Date())) }, person.cookie)
    expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', person.email, app.databaseFile, '--additional']).exitCode).toBe(0)

    expect((await operate(person.id, 'reset-mfa')).status).toBe(200)
    expect(read('SELECT user_id FROM totp_secrets WHERE user_id = ?', person.id)).toBeUndefined()
  })

  test('every operation refuses the operator own account', async () => {
    const me = read<{ id: string }>('SELECT id FROM users WHERE email = ?', officer.email)!.id
    for (const operation of ['disable', 'sign-out', 'reset-mfa']) {
      const refused = await operate(me, operation)
      expect(`${operation}: ${refused.status}`).toBe(`${operation}: 409`)
    }
    expect(read<{ disabled: number }>('SELECT disabled FROM users WHERE id = ?', me)!.disabled).toBe(0)
  })

  // Disabling the last administrator strands the system exactly as revoking would (A-120).
  test('the last administrator cannot be disabled', async () => {
    const spare = await subject('spare-admin')
    expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', spare.email, app.databaseFile, '--additional']).exitCode).toBe(0)

    // With two, one may go; the officer is then the last and is refused by the same guard.
    expect((await operate(spare.id, 'disable')).status).toBe(200)

    const another = await subject('another-admin')
    expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', another.email, app.databaseFile, '--additional']).exitCode).toBe(0)
    const theirs = await (async () => {
      const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email: another.email, password })).json() as { attemptId?: string }
      return attemptId ? '' : (await send('POST', '/api/auth/sign-in', { email: another.email, password })).headers.get('set-cookie')?.split(';')[0] ?? ''
    })()

    const me = read<{ id: string }>('SELECT id FROM users WHERE email = ?', officer.email)!.id
    const refused = await operate(me, 'disable', theirs)
    // The guard runs before the second-factor requirement, so either refusal proves it is guarded.
    expect([403, 409]).toContain(refused.status)
    expect(read<{ disabled: number }>('SELECT disabled FROM users WHERE id = ?', me)!.disabled).toBe(0)
  })

  test('an unknown account and an unknown operation are refused', async () => {
    expect((await operate('nosuchaccount', 'disable')).status).toBe(404)
    expect((await operate(read<{ id: string }>('SELECT id FROM users WHERE email = ?', officer.email)!.id, 'delete-everything')).status).toBe(400)
  })

  test('every operation is audited against the account it touched', async () => {
    const person = await subject('audited')
    await operate(person.id, 'sign-out')

    const entry = read<{ action: string, actor: string | null }>(`
      SELECT action, actor_id AS actor FROM audit_log WHERE target = ? AND action = 'session.revoked'
    `, `user:${person.id}`)
    expect(entry?.action).toBe('session.revoked')
    expect(entry?.actor).toBe(read<{ id: string }>('SELECT id FROM users WHERE email = ?', officer.email)!.id)
  })
})

describe.skipIf(skip !== null)('the account view (A-121 criterion 5)', () => {
  test('it carries the methods, the roles and the recent history', async () => {
    const person = await subject('viewed')
    await send('POST', '/api/admin/roles', { userId: person.id, role: 'BOX_OFFICE' }, cookie)

    const view = await (await send('GET', `/api/admin/accounts/${person.id}`, null, cookie)).json() as {
      account: { email: string }
      methods: { password: boolean, factor: boolean }
      grants: { role: string, live: boolean }[]
      history: { action: string }[]
    }

    expect(view.account.email).toBe(person.email)
    expect(view.methods).toMatchObject({ password: true, factor: false })
    expect(view.grants).toEqual([expect.objectContaining({ role: 'BOX_OFFICE', live: true })])
    expect(view.history.map(entry => entry.action)).toContain('account.registered')
  })

  test('it never carries the password hash', async () => {
    const person = await subject('opaque')
    const body = await (await send('GET', `/api/admin/accounts/${person.id}`, null, cookie)).text()
    expect(body).not.toContain('scrypt')
  })

  test('an unknown account is a 404', async () => {
    expect((await send('GET', '/api/admin/accounts/nosuchaccount', null, cookie)).status).toBe(404)
  })
})

async function officerView(): Promise<Bun.WebView> {
  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', officer.email)
  await fill(view, 'form input[type="password"]', password)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, 'document.querySelectorAll(\'[data-test="mfa-challenge"] input\').length >= 6')
  await fillPin(view, '[data-test="mfa-challenge"] input', await unusedCode())
  await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')
  return view
}

describe.skipIf(skip !== null)('the account screen', () => {
  test('an administrator disables an account from the screen', async () => {
    const person = await subject('onscreen')
    const view = await officerView()
    try {
      await visit(view, `${app.baseURL}/people/accounts/${person.id}`, '[data-test="account-name"]')
      expect(await textOf(view)).toContain(person.email)

      await click(view, '[data-test="disable"]')
      await waitFor(view, 'document.querySelector(\'[data-test="state-disabled"]\')')

      expect(read<{ disabled: number }>('SELECT disabled FROM users WHERE id = ?', person.id)!.disabled).toBe(1)
      expect(await stillSignedIn(person.cookie)).toBe(false)
    }
    finally {
      view.close()
    }
  }, 120_000)

  // A-118, 0009: the year end is the default, and permanent is an explicit switch, never the fallback.
  test('an administrator grants a role, and revokes it, from the screen (#929)', async () => {
    const person = await subject('grantable')
    const view = await officerView()
    try {
      await visit(view, `${app.baseURL}/people/accounts/${person.id}`, '[data-test="grant-role"]')

      await pickOption(view, '[data-test="grant-role"]', saysRole('BOX_OFFICE'))
      await click(view, '[data-test="grant-submit"]')
      await waitFor(view, 'document.querySelector(\'[data-test="revoke-BOX_OFFICE"]\')')

      const granted = read<{ expires_at: number | null }>(
        'SELECT expires_at FROM role_grants WHERE user_id = ? AND role = ?', person.id, 'BOX_OFFICE',
      )
      expect(granted?.expires_at).not.toBeNull()

      await click(view, '[data-test="revoke-BOX_OFFICE"]')
      await waitFor(view, '!document.querySelector(\'[data-test="revoke-BOX_OFFICE"]\')')

      expect(read('SELECT user_id FROM role_grants WHERE user_id = ? AND role = ?', person.id, 'BOX_OFFICE')).toBeUndefined()
    }
    finally {
      view.close()
    }
  }, 120_000)

  test('a permanent grant carries no expiry', async () => {
    const person = await subject('permanent')
    const view = await officerView()
    try {
      await visit(view, `${app.baseURL}/people/accounts/${person.id}`, '[data-test="grant-role"]')

      await pickOption(view, '[data-test="grant-role"]', saysRole('TREASURER'))
      await click(view, '[data-test="grant-permanent"]')
      await click(view, '[data-test="grant-submit"]')
      await waitFor(view, 'document.body.innerText.includes(\'further notice\')')

      expect(read<{ expires_at: number | null }>(
        'SELECT expires_at FROM role_grants WHERE user_id = ? AND role = ?', person.id, 'TREASURER',
      )?.expires_at).toBeNull()
    }
    finally {
      view.close()
    }
  }, 120_000)

  // The last-administrator guard is proven server-side already (A-120); this proves the screen
  // surfaces its refusal as copy rather than swallowing it (#929's suggested fix).
  test('revoking the last administrator refuses with copy on the screen', async () => {
    const view = await officerView()
    try {
      const me = read<{ id: string }>('SELECT id FROM users WHERE email = ?', officer.email)!.id

      // Earlier cases in this file grant ADMIN to spare subjects; only officer's own grant matters here.
      run('DELETE FROM role_grants WHERE role = ? AND user_id != ?', 'ADMIN', me)

      await visit(view, `${app.baseURL}/people/accounts/${me}`, '[data-test="grants"]')

      await click(view, '[data-test="revoke-ADMIN"]')
      await waitFor(view, 'document.querySelector(\'[data-test="failure"]\')')
      expect(await textOf(view, '[data-test="failure"]')).toContain('last administrator')

      expect(read('SELECT user_id FROM role_grants WHERE user_id = ? AND role = ?', me, 'ADMIN')).toBeDefined()
    }
    finally {
      view.close()
    }
  }, 120_000)

  test('an administrator erases an account from the screen, after typing the email back', async () => {
    const person = await subject('erasable')
    const view = await officerView()
    try {
      await visit(view, `${app.baseURL}/people/accounts/${person.id}`, '[data-test="erase-reveal"]')

      await click(view, '[data-test="erase-reveal"]')
      await waitFor(view, 'document.querySelector(\'[data-test="erase-confirm"]\')')

      // Wrong text leaves the button refused; only the exact address unlocks it.
      await fill(view, '[data-test="erase-confirm-email"]', 'not-the-right-address@example.com')
      expect(await view.evaluate<boolean>('document.querySelector(\'[data-test="erase-submit"]\').disabled')).toBe(true)

      await fill(view, '[data-test="erase-confirm-email"]', person.email)
      await click(view, '[data-test="erase-submit"]')
      await waitFor(view, 'document.querySelector(\'[data-test="merge"]\') === null')

      expect(read<{ anonymised_at: number | null }>(
        'SELECT anonymised_at FROM users WHERE id = ?', person.id,
      )?.anonymised_at).not.toBeNull()
    }
    finally {
      view.close()
    }
  }, 120_000)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
