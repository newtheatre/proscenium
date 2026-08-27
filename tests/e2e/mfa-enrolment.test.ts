import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { RECOVERY_CODE_COUNT, normaliseRecoveryCode } from '#shared/utils/recovery-codes'
import { codeForStep, stepFor } from '#shared/utils/totp'
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
  return fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body ?? {}),
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

function countRecoveryCodes(email: string): number {
  return read<{ n: number }>(`
    SELECT count(*) n FROM recovery_codes r JOIN users u ON u.id = r.user_id WHERE u.email = ?
  `, email)?.n ?? 0
}

function epochOf(email: string): number {
  return read<{ session_epoch: number }>('SELECT session_epoch FROM users WHERE email = ?', email)!.session_epoch
}

async function signedInMember(): Promise<{ email: string, cookie: string }> {
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = `mfa-${Math.random().toString(36).slice(2)}@${E2E_DOMAIN}`
  await send('POST', '/api/auth/register', { email, name: person.name, password })
  const response = await send('POST', '/api/auth/sign-in', { email, password })
  return { email, cookie: (response.headers.get('set-cookie') ?? '').split(';')[0]! }
}

// Confirming ends every other session and reissues this one, so the caller carries on with the
// cookie the confirmation handed back rather than the one it arrived with.
async function enrolAndConfirm(cookie: string): Promise<{ secret: string, codes: string[], cookie: string }> {
  const begun = await send('POST', '/api/account/mfa/enrol', {}, cookie)
  const { secret } = await begun.json() as { secret: string }
  const code = await codeForStep(secret, stepFor(new Date()))
  const confirmed = await send('POST', '/api/account/mfa/confirm', { code }, cookie)
  const { recoveryCodes } = await confirmed.json() as { recoveryCodes: string[] }
  const reissued = (confirmed.headers.get('set-cookie') ?? '').split(';')[0] || cookie
  return { secret, codes: recoveryCodes, cookie: reissued }
}

describe.skipIf(skip !== null)('enrolling a second factor (A-109, A-110)', () => {
  test('enrolment hands back a secret and an otpauth URI', async () => {
    const { cookie } = await signedInMember()
    const response = await send('POST', '/api/account/mfa/enrol', {}, cookie)
    expect(response.status).toBe(200)

    const body = await response.json() as { secret: string, uri: string }
    expect(body.secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(body.uri.startsWith('otpauth://totp/')).toBe(true)
  })

  test('a signed-out caller cannot enrol', async () => {
    expect((await send('POST', '/api/account/mfa/enrol', {})).status).toBe(401)
  })

  test('a wrong code does not confirm the factor', async () => {
    const { cookie } = await signedInMember()
    await send('POST', '/api/account/mfa/enrol', {}, cookie)
    expect((await send('POST', '/api/account/mfa/confirm', { code: '000000' }, cookie)).status).toBe(400)
  })

  // Confirming mints exactly eight codes, shown once and stored only as hashes.
  test('confirming mints the recovery codes', async () => {
    const { email, cookie } = await signedInMember()
    const { codes } = await enrolAndConfirm(cookie)

    expect(codes).toHaveLength(RECOVERY_CODE_COUNT)
    expect(countRecoveryCodes(email)).toBe(RECOVERY_CODE_COUNT)
  })

  test('the codes are stored as hashes, never as themselves', async () => {
    const { email, cookie } = await signedInMember()
    const { codes } = await enrolAndConfirm(cookie)

    const stored = read<{ code_hash: string }>(`
      SELECT r.code_hash FROM recovery_codes r JOIN users u ON u.id = r.user_id WHERE u.email = ?
    `, email)!
    expect(stored.code_hash).toMatch(/^[a-f0-9]{64}$/)
    for (const code of codes) {
      expect(stored.code_hash).not.toBe(normaliseRecoveryCode(code))
    }
  })

  // Confirming a first factor ends every other session (A-109 criterion 3).
  test('confirming ends every other session', async () => {
    const { email, cookie } = await signedInMember()
    const before = epochOf(email)
    await enrolAndConfirm(cookie)
    expect(epochOf(email)).toBe(before + 1)
  })

  // The epoch moves during the request, so the cookie it arrived with is dead and the one it
  // leaves with is not. Both halves matter.
  test('the confirming session is reissued, and the cookie it arrived with is not', async () => {
    const { cookie: original } = await signedInMember()
    const { cookie: reissued } = await enrolAndConfirm(original)

    const withOld = await (await fetch(`${app.baseURL}/api/auth/session`, { headers: { cookie: original } })).json() as { signedIn: boolean }
    const withNew = await (await fetch(`${app.baseURL}/api/auth/session`, { headers: { cookie: reissued } })).json() as { signedIn: boolean }

    expect(withOld.signedIn).toBe(false)
    expect(withNew.signedIn).toBe(true)
  })

  test('a second enrolment is refused once one is confirmed', async () => {
    const { cookie } = await signedInMember()
    const { cookie: reissued } = await enrolAndConfirm(cookie)
    expect((await send('POST', '/api/account/mfa/enrol', {}, reissued)).status).toBe(409)
  })

  // Regenerating retires the whole previous set (A-110 criterion 3).
  test('regenerating replaces the set rather than adding to it', async () => {
    const { email, cookie } = await signedInMember()
    const { codes: first, cookie: reissued } = await enrolAndConfirm(cookie)

    const response = await send('POST', '/api/account/mfa/recovery-codes', {}, reissued)
    const { recoveryCodes: second } = await response.json() as { recoveryCodes: string[] }

    expect(second).toHaveLength(RECOVERY_CODE_COUNT)
    expect(countRecoveryCodes(email)).toBe(RECOVERY_CODE_COUNT)
    expect(second.some(code => first.includes(code))).toBe(false)
  })

  test('there is nothing to regenerate without a factor', async () => {
    const { cookie } = await signedInMember()
    expect((await send('POST', '/api/account/mfa/recovery-codes', {}, cookie)).status).toBe(409)
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
