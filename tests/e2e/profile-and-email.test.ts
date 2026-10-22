import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, letters, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// A-114 and A-115, which share a screen: the profile is what the theatre holds, and the address
// is how it reaches you.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest

const password = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function read<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

async function signedIn(prefix: string): Promise<{ email: string, cookie: string, view: Bun.WebView }> {
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = registrableAddress(prefix)
  await fetch(`${app.baseURL}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, name: person.name, password }),
  })
  markVerified(app, email)

  const answered = await fetch(`${app.baseURL}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const cookie = (answered.headers.get('set-cookie') ?? '').split(';')[0]!

  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', email)
  await fill(view, 'form input[type="password"]', password)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')
  return { email, cookie, view }
}

const send = (method: string, path: string, cookie: string, body?: unknown): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

describe.skipIf(skip !== null)('the profile (A-114)', () => {
  test('every field says who can see it before it is filled in', async () => {
    const { view } = await signedIn('profile-audiences')
    try {
      await visit(view, `${app.baseURL}/account/profile`, '[data-test="profile-form"]')
      const shown = await textOf(view, '[data-test="profile-form"]')

      expect(shown).toContain('Only you')
      expect(shown).toContain('officers who can already look up accounts')
      // Criterion 3: these are consents owned by module D, not profile fields.
      expect(shown.toLowerCase()).not.toContain('dietary')
      expect(shown.toLowerCase()).not.toContain('access needs')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a name change lands on the record everything else refers to', async () => {
    const { email, view } = await signedIn('profile-name')
    try {
      await visit(view, `${app.baseURL}/account/profile`, '[data-test="profile-form"]')
      await fill(view, '[data-test="profile-name"]', 'Imogen Hart-Reid')
      await fill(view, '[data-test="profile-pronouns"]', 'they/them')
      await click(view, '[data-test="profile-save"]')
      // The toast, not the field: the field already reads what was typed into it.
      await waitFor(view, `document.body.innerText.includes('Profile saved')`, 30_000)

      const row = read<{ name: string, pronouns: string }>('SELECT name, pronouns FROM users WHERE email = ?', email)
      expect(row?.name).toBe('Imogen Hart-Reid')
      expect(row?.pronouns).toBe('they/them')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('an emergency contact is kept, and clearing its name removes the row', async () => {
    const { email, cookie, view } = await signedIn('profile-emergency')
    try {
      const person = read<{ id: string }>('SELECT id FROM users WHERE email = ?', email)!

      await send('PUT', '/api/account/profile', cookie, {
        name: 'Imogen Hart',
        emergencyName: 'Her Mother',
        emergencyPhone: '07700 900000',
        emergencyRelation: 'mother',
      })
      expect(read<{ phone: string }>('SELECT phone FROM emergency_contacts WHERE user_id = ?', person.id)?.phone)
        .toBe('07700 900000')

      await send('PUT', '/api/account/profile', cookie, { name: 'Imogen Hart' })
      expect(read('SELECT phone FROM emergency_contacts WHERE user_id = ?', person.id)).toBeUndefined()
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a contact with nobody to ring is refused', async () => {
    const { cookie, view } = await signedIn('profile-halfcontact')
    try {
      const refused = await send('PUT', '/api/account/profile', cookie, { name: 'Imogen Hart', emergencyName: 'Her Mother' })
      expect(refused.status).toBe(400)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // The trail records that a profile changed and which fields; never what they now say (0011).
  test('the trail names the fields and not their values', async () => {
    const { email, cookie, view } = await signedIn('profile-audit')
    try {
      await send('PUT', '/api/account/profile', cookie, { name: 'Imogen Fairweather', phone: '07700 900123' })
      const entry = read<{ detail: string }>(`
        SELECT l.detail FROM audit_log l JOIN users u ON u.id = l.actor_id
        WHERE u.email = ? AND l.action = 'account.profile.updated'`, email)

      expect(entry?.detail).toContain('name')
      expect(entry?.detail).not.toContain('Fairweather')
      expect(entry?.detail).not.toContain('900123')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

// The link to the address it reached, read from the dev mailbox the way a person reads theirs.
async function verifyLinkTo(email: string): Promise<string> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const found = (await letters(app))
      .filter(letter => letter.startsWith(`To: ${email}`))
      .map(letter => letter.match(/https?:\/\/\S*\/verify\?token=([0-9a-f]+)/)?.[1])
      .find(Boolean)
    if (found) return found
    await Bun.sleep(200)
  }
  throw new Error(`no confirmation link reached ${email}`)
}

describe.skipIf(skip !== null)('changing an email address (A-115, 0151)', () => {
  test('asking moves nothing, and the old address is told', async () => {
    const { email, cookie, view } = await signedIn('email-change')
    try {
      const before = read<{ e: number }>('SELECT session_epoch e FROM users WHERE email = ?', email)!
      const wanted = registrableAddress('email-changed')

      const asked = await send('PUT', '/api/account/email', cookie, { email: wanted })
      expect(asked.status).toBe(200)

      const still = read<{ e: number, verified: number }>('SELECT session_epoch e, verified FROM users WHERE email = ?', email)
      expect(still?.verified).toBe(1)
      expect(still?.e).toBe(before.e)
      expect((await send('GET', '/api/account/methods', cookie)).status).toBe(200)
      expect(await (await send('GET', '/api/account/email', cookie)).json()).toEqual({ email, pending: wanted })

      const warned = read<{ n: number }>(`
        SELECT count(*) n FROM notification_log l JOIN users u ON u.id = l.user_id
        WHERE u.email = ? AND l.type = 'account.email.requested'`, email)
      expect(warned?.n).toBe(1)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the link from the new address moves it, ends every session and tells the old one', async () => {
    const { email, cookie, view } = await signedIn('email-confirm')
    try {
      const before = read<{ e: number }>('SELECT session_epoch e FROM users WHERE email = ?', email)!
      const wanted = registrableAddress('email-confirmed')
      await send('PUT', '/api/account/email', cookie, { email: wanted })

      const token = await verifyLinkTo(wanted)
      const confirmed = await fetch(`${app.baseURL}/api/auth/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      expect(confirmed.status).toBe(200)
      expect(await confirmed.json()).toMatchObject({ changed: true, signedIn: false })

      const after = read<{ e: number, verified: number }>('SELECT session_epoch e, verified FROM users WHERE email = ?', wanted)
      expect(after?.verified).toBe(1)
      expect(after?.e).toBe(before.e + 1)
      expect((await send('GET', '/api/account/methods', cookie)).status).toBe(401)

      const told = (await letters(app)).filter(letter => letter.startsWith(`To: ${email}`) && letter.includes(wanted))
      expect(told.length).toBeGreaterThanOrEqual(2)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a clash tells the requester nothing and warns the address that is taken', async () => {
    const other = await signedIn('email-taken')
    const { cookie, view } = await signedIn('email-clash')
    try {
      const answered = await send('PUT', '/api/account/email', cookie, { email: other.email })
      // The same shape as a change that happened: nothing here says the address exists.
      expect(answered.status).toBe(200)

      const warned = read<{ n: number }>(`
        SELECT count(*) n FROM notification_log l JOIN users u ON u.id = l.user_id
        WHERE u.email = ? AND l.type = 'account.email.taken'`, other.email)
      expect(warned?.n).toBe(1)
    }
    finally {
      view.close()
      other.view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a password-holding account is refused a Workspace address, and told why', async () => {
    const { cookie, view } = await signedIn('email-workspace')
    try {
      const refused = await send('PUT', '/api/account/email', cookie, { email: `moved-${Date.now()}@newtheatre.org.uk` })
      expect(refused.status).toBe(400)
      expect(await refused.text()).toContain('Google')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a link issued for one address will not confirm a later one', async () => {
    const { cookie, view } = await signedIn('email-replay')
    try {
      await send('PUT', '/api/account/email', cookie, { email: registrableAddress('email-first') })
      const stale = read<{ hash: string }>('SELECT token_hash hash FROM auth_tokens ORDER BY created_at DESC LIMIT 1')
      expect(stale).toBeDefined()

      // Asking again before the first link is followed replaces it, which is what the binding is for.
      const second = registrableAddress('email-second')
      await send('PUT', '/api/account/email', cookie, { email: second })
      expect(read('SELECT token_hash FROM auth_tokens WHERE token_hash = ?', stale!.hash)).toBeUndefined()
      expect((await (await send('GET', '/api/account/email', cookie)).json()).pending).toBe(second)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // A change somebody else asked for is ended from the warning, before its link can be opened.
  async function cancelledLink(token: string): Promise<number> {
    const opened = await fetch(`${app.baseURL}/api/auth/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    return opened.status
  }

  test('a pending change can be cancelled, and its link then moves nothing', async () => {
    const { email, cookie, view } = await signedIn('email-cancel')
    try {
      const wanted = registrableAddress('email-cancelled')
      await send('PUT', '/api/account/email', cookie, { email: wanted })
      const token = await verifyLinkTo(wanted)

      const warning = (await letters(app)).find(letter => letter.startsWith(`To: ${email}`) && letter.includes(wanted))
      expect(warning).toContain('/account/profile#email')

      const cancelled = await send('DELETE', '/api/account/email', cookie)
      expect(cancelled.status).toBe(200)
      expect(await cancelled.json()).toMatchObject({ cancelled: true })
      const resealed = (cancelled.headers.get('set-cookie') ?? '').split(';')[0]!
      expect(await (await send('GET', '/api/account/email', resealed)).json()).toEqual({ email, pending: null })

      expect(await cancelledLink(token)).toBe(410)
      expect(read('SELECT id FROM users WHERE email = ?', email)).toBeDefined()
      expect(read('SELECT id FROM users WHERE email = ?', wanted)).toBeUndefined()

      const logged = read<{ n: number }>(`
        SELECT count(*) n FROM audit_log l JOIN users u ON u.id = l.actor_id
        WHERE u.email = ? AND l.action = 'account.email.change.cancelled'`, email)
      expect(logged?.n).toBe(1)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the profile offers to cancel a pending change', async () => {
    const { cookie, view } = await signedIn('email-cancel-screen')
    try {
      await send('PUT', '/api/account/email', cookie, { email: registrableAddress('email-cancel-shown') })
      await visit(view, `${app.baseURL}/account/profile`, '[data-test="pending-email"]')
      await click(view, '[data-test="cancel-email-change"]')
      await waitFor(view, '!document.querySelector(\'[data-test="pending-email"]\')')
      expect(await view.evaluate<string>('fetch(\'/api/account/email\').then(r => r.json()).then(j => String(j.pending))')).toBe('null')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // The borrowed session is what asked, so cancelling must end it or it simply asks again.
  test('cancelling ends every other session, so the one that asked cannot ask again', async () => {
    const { email, cookie, view } = await signedIn('email-cancel-borrowed')
    try {
      const borrowed = ((await fetch(`${app.baseURL}/api/auth/sign-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })).headers.get('set-cookie') ?? '').split(';')[0]!
      await send('PUT', '/api/account/email', borrowed, { email: registrableAddress('email-borrowed') })

      const cancelled = await send('DELETE', '/api/account/email', cookie)
      expect(cancelled.status).toBe(200)
      const resealed = (cancelled.headers.get('set-cookie') ?? '').split(';')[0]!
      expect((await send('GET', '/api/account/email', resealed)).status).toBe(200)

      expect((await send('GET', '/api/account/email', borrowed)).status).toBe(401)
      expect((await send('PUT', '/api/account/email', borrowed, { email: registrableAddress('email-borrowed-again') })).status).toBe(401)
      expect((await (await send('GET', '/api/account/email', resealed)).json()).pending).toBeNull()
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('changing the password cancels a pending change', async () => {
    const { email, cookie, view } = await signedIn('email-cancel-password')
    try {
      const wanted = registrableAddress('email-cancel-by-password')
      await send('PUT', '/api/account/email', cookie, { email: wanted })
      const token = await verifyLinkTo(wanted)

      const changed = await send('PUT', '/api/account/password', cookie, { password: generatePassword() })
      expect(changed.status).toBe(200)
      // Answering the warning ends the other sessions, and this one is re-sealed to carry on.
      const resealed = (changed.headers.get('set-cookie') ?? '').split(';')[0]!
      expect((await send('GET', '/api/account/email', cookie)).status).toBe(401)
      expect((await (await send('GET', '/api/account/email', resealed)).json()).pending).toBeNull()
      expect(await cancelledLink(token)).toBe(410)
      expect(read('SELECT id FROM users WHERE email = ?', email)).toBeDefined()
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})
