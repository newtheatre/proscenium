import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { forgetSpentStep, markVerified, registerMember } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, fillDate, openSignedOutView, pickPerson, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest

const password = generatePassword()
const officer = { ...syntheticPerson(81), email: registrableAddress('registrar') }
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

async function signInThroughTheChallenge(): Promise<string> {
  forgetSpentStep(app, officer.email)
  const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email: officer.email, password })).json() as { attemptId: string }
  const answered = await send('POST', '/api/auth/mfa/challenge', {
    attemptId,
    code: await codeForStep(secret, stepFor(new Date())),
  })
  return (answered.headers.get('set-cookie') ?? '').split(';')[0]!
}

const AWARD = { awardedOn: '2019-06-12', awardedBy: 'Committee, 12 June 2019', citation: 'For a decade behind the lighting desk.' }

const record = (userId: string, extra: Record<string, unknown> = {}): Promise<Response> =>
  send('POST', '/api/admin/fellowships', { userId, ...AWARD, ...extra }, cookie)

interface Fellow { id: string, userId: string, name: string, citation: string, revokedAt: number | null }

async function roll(query = ''): Promise<{ items: Fellow[], total: number }> {
  const response = await send('GET', `/api/admin/fellowships${query}`, null, cookie)
  expect(response.status).toBe(200)
  return await response.json() as { items: Fellow[], total: number }
}

describe.skipIf(skip !== null)('recording the roll of Fellows (A-127)', () => {
  test('an award lands on the roll and on the account', async () => {
    const alumna = await registerMember(app, 'honoured', password, { signIn: false })
    const response = await record(alumna.id)
    expect(response.status).toBe(200)

    const listed = (await roll(`?search=${encodeURIComponent(alumna.email)}`)).items
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ userId: alumna.id, citation: AWARD.citation, revokedAt: null })

    const account = await (await send('GET', `/api/admin/accounts/${alumna.id}`, null, cookie)).json() as { fellowship: { citation: string } | null }
    expect(account.fellowship?.citation).toBe(AWARD.citation)
  })

  // Criterion 2: the constraint is the rule, and the message is what somebody reads instead of it.
  test('a person can hold only one', async () => {
    const alumna = await registerMember(app, 'twice', password, { signIn: false })
    expect((await record(alumna.id)).status).toBe(200)

    const again = await record(alumna.id)
    expect(again.status).toBe(409)
    expect((await again.json() as { statusMessage: string }).statusMessage).toMatch(/already holds/i)
  })

  test('an erased account cannot be honoured, and an unknown one is not found', async () => {
    const gone = await registerMember(app, 'erased-fellow', password)
    expect((await send('POST', `/api/admin/accounts/${gone.id}/security`, { operation: 'erase' }, cookie)).status).toBe(200)

    expect((await record(gone.id)).status).toBe(409)
    expect((await record('ffffffffffffffffffffffffffffffff')).status).toBe(404)
  })

  // Criterion 5: the trail says an award happened and to whom, and holds neither the citation nor
  // the reason (0011).
  test('the audit entry carries the fellowship id and nothing about the wording', async () => {
    const alumna = await registerMember(app, 'audited-fellow', password, { signIn: false })
    const { id } = await (await record(alumna.id)).json() as { id: string }

    const entry = read<{ detail: string }>(
      'SELECT detail FROM audit_log WHERE action = ? AND target = ?', 'fellowship.awarded', `user:${alumna.id}`)
    expect(JSON.parse(entry!.detail)).toEqual({ fellowship: id })

    expect((await send('POST', `/api/admin/fellowships/${id}/revoke`, { reason: 'A safeguarding matter.' }, cookie)).status).toBe(200)
    const revoked = read<{ detail: string }>('SELECT detail FROM audit_log WHERE action = ?', 'fellowship.revoked')
    expect(revoked!.detail).not.toContain('safeguarding')
  })

  // Criterion 4: the award, the date and the citation all stand.
  test('revoking adds a fact and corrects nothing', async () => {
    const alumna = await registerMember(app, 'revoked-fellow', password, { signIn: false })
    const { id } = await (await record(alumna.id)).json() as { id: string }

    expect((await send('POST', `/api/admin/fellowships/${id}/revoke`, { reason: 'A safeguarding matter.' }, cookie)).status).toBe(200)
    expect((await send('POST', `/api/admin/fellowships/${id}/revoke`, { reason: 'Again.' }, cookie)).status).toBe(409)

    const held = read<{ awarded: string, citation: string, revoked: number | null }>(
      'SELECT awarded_on AS awarded, citation, revoked_at AS revoked FROM fellowships WHERE id = ?', id)!
    expect(held.awarded).toBe(AWARD.awardedOn)
    expect(held.citation).toBe(AWARD.citation)
    expect(held.revoked).not.toBeNull()

    expect((await roll('?show=current')).items.some(fellow => fellow.id === id)).toBe(false)
    expect((await roll('?show=revoked')).items.some(fellow => fellow.id === id)).toBe(true)
  })

  test('recording one needs the permission', async () => {
    const stranger = await registerMember(app, 'not-a-registrar', password)
    expect((await send('GET', '/api/admin/fellowships', null, stranger.cookie)).status).toBe(403)
    expect((await send('POST', '/api/admin/fellowships', { userId: stranger.id, ...AWARD }, stranger.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('the roll in a browser (A-127)', () => {
  test('an officer records an award and sees it on the roll', async () => {
    const alumna = await registerMember(app, 'onscreen-fellow', password, { signIn: false })

    forgetSpentStep(app, officer.email)
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', officer.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelectorAll('[data-test="mfa-challenge"] input').length >= 6`)

      const code = await codeForStep(secret, stepFor(new Date()) + 1)
      for (const [index, digit] of [...code].entries()) {
        await fill(view, `[data-test="mfa-challenge"] input:nth-of-type(${index + 1})`, digit)
      }
      await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')

      await visit(view, `${app.baseURL}/people/fellows`, '[data-test="fellows-table"]')
      await click(view, '[data-test="award"]')
      // Searched by address, because syntheticPerson draws first names from a short list and two
      // people sharing one would let the picker choose the wrong person.
      await pickPerson(view, '[data-test="person-picker"]', alumna.email.split('@')[0]!, alumna.name)
      await fillDate(view, '[data-test="award-date"]', '2021-03-04')
      await fill(view, 'input[data-test="award-by"]', 'Committee, 4 March 2021')
      await fill(view, '[data-test="award-citation"]', 'For twenty years of front of house.')
      await click(view, '[data-test="award-submit"]')

      // The outcome rather than the notification: a toast dismisses itself, and racing one proves
      // nothing. Searched for by name, because the roll pages and this suite fills it.
      await fill(view, 'input[data-test="toolbar-search"]', alumna.email.split('@')[0]!)
      // Optional chaining because the table unmounts while the search reloads it, and the case's
      // own budget: under a full run this is the slowest screen in the suite.
      await waitFor(view, `document.querySelector('[data-test="fellows-table"]')?.innerText.includes('front of house')`, CASE_TIMEOUT_MS - 20_000)
      expect(await textOf(view, '[data-test="fellows-table"]')).toContain(alumna.name)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
