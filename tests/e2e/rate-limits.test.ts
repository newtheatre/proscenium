import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { CONFIG_KEYS } from '#shared/utils/config'
import { generatePassword, syntheticPerson } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 60_000
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

function address(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}@${E2E_DOMAIN}`
}

describe.skipIf(skip !== null)('rate limits (A-102, A-103)', () => {
  const signInLimit = CONFIG_KEYS.SIGN_IN_ATTEMPTS_PER_ACCOUNT.default
  const resendLimit = CONFIG_KEYS.VERIFY_RESEND_ATTEMPTS.default

  test('sign-in refuses once the window is spent, and says how long to wait', async () => {
    const email = address('limit')
    let last = await post('/api/auth/sign-in', { email, password })

    for (let attempt = 1; attempt <= signInLimit; attempt++) {
      last = await post('/api/auth/sign-in', { email, password })
    }

    expect(last.status).toBe(429)
    expect(Number(last.headers.get('retry-after'))).toBeGreaterThan(0)
  }, CASE_TIMEOUT_MS)

  // A different address has its own bucket, so one person cannot lock out another.
  test('the limit is per address, not global', async () => {
    const busy = address('busy')
    for (let attempt = 0; attempt <= signInLimit; attempt++) {
      await post('/api/auth/sign-in', { email: busy, password })
    }
    expect((await post('/api/auth/sign-in', { email: busy, password })).status).toBe(429)

    const bystander = await post('/api/auth/sign-in', { email: address('bystander'), password })
    expect(bystander.status).toBe(401)
  }, CASE_TIMEOUT_MS)

  // Counted on the address submitted rather than the account found, so being limited says
  // nothing about whether an account exists (A-103 criterion 4).
  test('a real and an invented address are limited identically', async () => {
    const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
    const real = address('real')
    await post('/api/auth/register', { email: real, name: person.name, password })

    const invented = address('invented')
    const spend = async (email: string): Promise<number> => {
      let status = 0
      for (let attempt = 0; attempt <= signInLimit; attempt++) {
        status = (await post('/api/auth/sign-in', { email, password: 'wrong password entirely' })).status
      }
      return status
    }

    expect(await spend(real)).toBe(await spend(invented))
  }, CASE_TIMEOUT_MS)

  test('resending verification is limited on its own scope', async () => {
    const email = address('resend')
    let last = await post('/api/auth/verify/resend', { email })

    for (let attempt = 1; attempt <= resendLimit; attempt++) {
      last = await post('/api/auth/verify/resend', { email })
    }

    expect(last.status).toBe(429)
  }, CASE_TIMEOUT_MS)

  // This proves no attempt is lost, not that the write is atomic. An in-process SQLite
  // serialises, so it passes against a read-then-write counter too, which I checked (0022).
  test('every attempt fired at once is still counted', async () => {
    const email = address('race')
    const attempts = signInLimit * 2

    const statuses = await Promise.all(
      Array.from({ length: attempts }, () => post('/api/auth/sign-in', { email, password })),
    ).then(responses => responses.map(response => response.status))

    const refused = statuses.filter(status => status === 429).length
    const allowed = statuses.filter(status => status !== 429).length

    // Every attempt accounted for, and no more than the limit let through.
    expect(allowed + refused).toBe(attempts)
    expect(allowed).toBeLessThanOrEqual(signInLimit)
    expect(refused).toBeGreaterThan(0)
  }, CASE_TIMEOUT_MS)

  // Separate scopes: exhausting one must not close the other.
  test('spending the sign-in budget leaves the resend budget alone', async () => {
    const email = address('scoped')
    for (let attempt = 0; attempt <= signInLimit; attempt++) {
      await post('/api/auth/sign-in', { email, password })
    }
    expect((await post('/api/auth/sign-in', { email, password })).status).toBe(429)
    expect((await post('/api/auth/verify/resend', { email })).status).toBe(200)
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
