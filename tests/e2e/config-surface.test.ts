import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { CONFIG_KEYS, CONFIG_KEY_NAMES } from '#shared/utils/config'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, fillPin, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest

const password = generatePassword()
const officer = { ...syntheticPerson(21), email: registrableAddress('settings') }
const bystander = { ...syntheticPerson(22), email: registrableAddress('bystander') }
let cookie = ''
let secret = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()

  for (const person of [officer, bystander]) {
    await send('POST', '/api/auth/register', { email: person.email, name: person.name, password })
    markVerified(app, person.email)
  }

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

async function signInThroughTheChallenge(): Promise<string> {
  const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email: officer.email, password })).json() as { attemptId: string }
  const answered = await send('POST', '/api/auth/mfa/challenge', { attemptId, code: await unusedCode() })
  return (answered.headers.get('set-cookie') ?? '').split(';')[0]!
}

function spentStep(): number | null {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    const row = database.query(`
      SELECT t.last_used_step AS step FROM totp_secrets t JOIN users u ON u.id = t.user_id WHERE u.email = ?
    `).get(officer.email) as { step: number | null } | null
    return row?.step ?? null
  }
  finally {
    database.close()
  }
}

// A spent step cannot answer a second challenge, and a code two steps out is outside tolerance:
// so the only safe code is the current step, once the clock has left the one already used.
async function unusedCode(): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const step = stepFor(new Date())
    if (step !== spentStep()) return codeForStep(secret, step)
    await Bun.sleep(1000)
  }
  throw new Error('the authenticator step did not move on')
}

interface Setting { key: string, value: unknown, set: boolean, enforced: boolean, default: unknown, updatedBy: { name: string } | null }

async function settings(): Promise<Setting[]> {
  const answer = await (await send('GET', '/api/admin/config', null, cookie)).json() as { settings: Setting[] }
  return answer.settings
}

const settingFor = async (key: string): Promise<Setting> => (await settings()).find(setting => setting.key === key)!

function auditFor(key: string): { detail: string } | null {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(`
      SELECT detail FROM audit_log WHERE action = 'config.changed' AND target = ? ORDER BY created_at DESC
    `).get(`config:${key}`) as { detail: string } | null
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

describe.skipIf(skip !== null)('the settings surface (J-104)', () => {
  test('every key is listed with its default and whether it is enforced', async () => {
    const listed = await settings()
    expect(listed.map(setting => setting.key).sort()).toEqual([...CONFIG_KEY_NAMES].sort())

    const known = listed.find(setting => setting.key === 'PASSWORD_MIN_LENGTH')!
    expect(known.default).toBe(CONFIG_KEYS.PASSWORD_MIN_LENGTH.default)
    expect(known.enforced).toBe(true)
    expect(listed.find(setting => setting.key === 'BAR_TAB_CAP_PENCE')!.enforced).toBe(false)
  })

  test('a change is stored, shows who made it, and takes effect at the write path', async () => {
    const raised = CONFIG_KEYS.PASSWORD_MIN_LENGTH.default + 5
    try {
      expect((await send('PUT', '/api/admin/config/PASSWORD_MIN_LENGTH', { value: raised }, cookie)).status).toBe(200)

      const setting = await settingFor('PASSWORD_MIN_LENGTH')
      expect(setting).toMatchObject({ value: raised, set: true })
      expect(setting.updatedBy?.name).toBe(officer.name)

      const policy = await (await send('GET', '/api/auth/password-policy')).json() as { minLength: number }
      expect(policy.minLength).toBe(raised)
    }
    finally {
      clearOverride('PASSWORD_MIN_LENGTH')
    }
  })

  test('the change is audited with the values it moved between', async () => {
    try {
      await send('PUT', '/api/admin/config/BAR_TAB_CAP_PENCE', { value: 2500 }, cookie)
      const entry = auditFor('BAR_TAB_CAP_PENCE')
      expect(JSON.parse(entry!.detail)).toMatchObject({ key: 'BAR_TAB_CAP_PENCE', from: 2000, to: 2500 })
    }
    finally {
      clearOverride('BAR_TAB_CAP_PENCE')
    }
  })

  // Audit detail carries identifiers and never people, so a recipients list is hashed (0011, 0024).
  test('a key holding addresses is audited as a hash, not as the addresses', async () => {
    try {
      const stored = await send('PUT', '/api/admin/config/NIGHT_REPORT_RECIPIENTS', { value: ['duty@newtheatre.org.uk'] }, cookie)
      expect(stored.status).toBe(200)

      const entry = auditFor('NIGHT_REPORT_RECIPIENTS')!
      expect(entry.detail).not.toContain('duty@')
      expect(JSON.parse(entry.detail)).toMatchObject({ redacted: true })
      expect((await settingFor('NIGHT_REPORT_RECIPIENTS')).value).toEqual(['duty@newtheatre.org.uk'])
    }
    finally {
      clearOverride('NIGHT_REPORT_RECIPIENTS')
    }
  })

  test('an unset key can be set, which is what the workshops are for', async () => {
    expect((await settingFor('NIGHT_REPORT_RECIPIENTS')).set).toBe(false)
    expect((await settingFor('NIGHT_REPORT_RECIPIENTS')).default).toBeNull()
  })

  test('a value the rules refuse is never stored, and the refusal names the rule', async () => {
    const refused = await send('PUT', '/api/admin/config/SEASON_START', { value: '02-29' }, cookie)
    expect(refused.status).toBe(400)
    expect((await refused.json()).statusMessage ?? '').toContain('29 February')
    expect((await settingFor('SEASON_START')).set).toBe(false)
  })

  // Arming would read as done while doing nothing: there is no sweep (J-105 criterion 4, K-111).
  test('retention cannot be armed while there is no sweep to arm', async () => {
    const refused = await send('PUT', '/api/admin/config/RETENTION_ARMED', { value: true }, cookie)
    expect(refused.status).toBe(409)
    expect((await settingFor('RETENTION_ARMED')).set).toBe(false)
  })

  test('a key that does not exist is a 404, not a new setting', async () => {
    expect((await send('PUT', '/api/admin/config/NOT_A_SETTING', { value: 1 }, cookie)).status).toBe(404)
  })

  test('someone without the permission cannot read or change a setting', async () => {
    const signedIn = await send('POST', '/api/auth/sign-in', { email: bystander.email, password })
    const theirs = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!

    expect((await send('GET', '/api/admin/config', null, theirs)).status).toBe(403)
    expect((await send('PUT', '/api/admin/config/BAR_TAB_CAP_PENCE', { value: 1 }, theirs)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('the settings screen', () => {
  test('an administrator changes a value through the screen', async () => {
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', officer.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, 'document.querySelectorAll(\'[data-test="mfa-challenge"] input\').length >= 6')

      await fillPin(view, '[data-test="mfa-challenge"] input', await unusedCode())
      await waitFor(view, 'document.querySelector(\'[data-test="sign-out"]\')')

      await visit(view, `${app.baseURL}/admin/config`, '[data-test="setting-BAR_TAB_CAP_PENCE"]')
      expect(await textOf(view)).toContain('Not enforced yet')

      await fill(view, '[data-test="input-BAR_TAB_CAP_PENCE"]', '3000')
      await click(view, '[data-test="save-BAR_TAB_CAP_PENCE"]')
      await waitFor(view, 'document.body.innerText.includes("Changed by")')

      expect((await settingFor('BAR_TAB_CAP_PENCE')).value).toBe(3000)
    }
    finally {
      clearOverride('BAR_TAB_CAP_PENCE')
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
