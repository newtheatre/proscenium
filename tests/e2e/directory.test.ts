import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { DEFAULT_PAGE_SIZE } from '#shared/utils/pagination'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { forgetSpentStep, markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, fillPin, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

const password = generatePassword()
const officer = { ...syntheticPerson(31), email: registrableAddress('directory') }
const bystander = { ...syntheticPerson(32), email: registrableAddress('looker') }
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

// A spent step cannot answer a second challenge, and a code two steps out is outside tolerance.
async function signInThroughTheChallenge(): Promise<string> {
  forgetSpentStep(app, officer.email)
  const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email: officer.email, password })).json() as { attemptId: string }
  const answered = await send('POST', '/api/auth/mfa/challenge', {
    attemptId,
    code: await codeForStep(secret, stepFor(new Date())),
  })
  return (answered.headers.get('set-cookie') ?? '').split(';')[0]!
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

function write(sql: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(sql).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

interface Listing {
  items: { id: string, email: string, name: string, hasFactor: boolean, hasPassword: boolean }[]
  page: number
  pageSize: number
  total: number
  pages: number
  awaiting: string | null
  banners: { privilegedWithoutFactor: number, insideRetentionWindow: number }
}

async function directory(query = ''): Promise<Listing> {
  const response = await send('GET', `/api/admin/accounts${query}`, null, cookie)
  expect(response.status).toBe(200)
  return await response.json() as Listing
}

const emails = (listing: Listing): string[] => listing.items.map(item => item.email)

// Verified by default because a signed-in member has to be (0026); the filter tests want one
// that is not.
async function member(prefix: string, verified = true): Promise<string> {
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = registrableAddress(prefix)
  await send('POST', '/api/auth/register', { email, name: person.name, password })
  if (verified) markVerified(app, email)
  return email
}

describe.skipIf(skip !== null)('the account directory (A-121)', () => {
  test('it answers with an envelope and pages in SQL, never a bare array', async () => {
    const listing = await directory()
    expect(Array.isArray(listing.items)).toBe(true)
    expect(listing).toMatchObject({ page: 1, pageSize: DEFAULT_PAGE_SIZE })
    expect(listing.total).toBeGreaterThanOrEqual(2)
    expect(listing.pages).toBeGreaterThanOrEqual(1)

    const small = await directory('?pageSize=1')
    expect(small.items).toHaveLength(1)
    expect(small.pages).toBe(small.total)

    const second = await directory('?pageSize=1&page=2')
    expect(second.items[0]!.email).not.toBe(small.items[0]!.email)
  })

  test('the response carries no password hash and no Google subject', async () => {
    const listing = await directory()
    const serialised = JSON.stringify(listing.items[0])
    expect(serialised).not.toContain('password')
    expect(serialised).not.toContain('googleSub')
    expect(listing.items[0]).toHaveProperty('hasPassword')
  })

  test('search matches a name or an address, and nothing else', async () => {
    const found = await directory(`?search=${encodeURIComponent(officer.email.split('@')[0]!)}`)
    expect(emails(found)).toContain(officer.email)
    expect(emails(found)).not.toContain(bystander.email)

    expect((await directory('?search=nobodyatallmatchesthis')).total).toBe(0)
  })

  test('an unverified account is found by the filter and a verified one is not', async () => {
    const email = await member('unverified', false)
    expect(emails(await directory('?filter=unverified'))).toContain(email)

    write('UPDATE users SET verified = 1 WHERE email = ?', email)
    expect(emails(await directory('?filter=unverified'))).not.toContain(email)
  })

  test('a disabled account is found only by its own filter', async () => {
    const email = await member('disabled', false)
    write('UPDATE users SET disabled = 1 WHERE email = ?', email)

    expect(emails(await directory('?filter=disabled'))).toContain(email)
    expect(emails(await directory(`?filter=unverified&search=${encodeURIComponent(email)}`))).toContain(email)
    write('UPDATE users SET disabled = 0 WHERE email = ?', email)
  })

  // Anonymised rows are hidden unless explicitly requested (criterion 4).
  test('an anonymised account is hidden until it is asked for', async () => {
    const email = await member('tombstone')
    write('UPDATE users SET anonymised_at = ? WHERE email = ?', Math.floor(Date.now() / 1000), email)

    expect(emails(await directory(`?search=${encodeURIComponent(email)}`))).not.toContain(email)
    expect(emails(await directory('?filter=anonymised'))).toContain(email)
    expect(emails(await directory(`?includeAnonymised=true&search=${encodeURIComponent(email)}`))).toContain(email)
  })

  test('role holders can be narrowed to one role', async () => {
    const email = await member('holder')
    const id = read<{ id: string }>('SELECT id FROM users WHERE email = ?', email)!.id
    expect((await send('POST', '/api/admin/roles', { userId: id, role: 'BOX_OFFICE' }, cookie)).status).toBe(200)

    expect(emails(await directory('?filter=role-holders'))).toContain(email)
    expect(emails(await directory('?filter=role-holders&role=BOX_OFFICE'))).toContain(email)
    expect(emails(await directory('?filter=role-holders&role=FOH_MANAGER'))).not.toContain(email)
  })

  // The A-112 banner: the same rule requiresSecondFactor applies per account, over the table.
  test('privileged accounts without a factor are found and counted', async () => {
    const email = await member('privileged')
    const before = (await directory()).banners.privilegedWithoutFactor

    expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', email, app.databaseFile, '--additional']).exitCode).toBe(0)

    const listing = await directory('?filter=privileged-without-mfa')
    expect(emails(listing)).toContain(email)
    expect(emails(listing)).not.toContain(officer.email)
    expect(listing.banners.privilegedWithoutFactor).toBe(before + 1)
  })

  test('a long-dormant account is inside the retention window, and a fresh one is not', async () => {
    const email = await member('dormant')
    const longAgo = Math.floor(Date.now() / 1000) - 5 * 365 * 24 * 60 * 60
    write('UPDATE users SET last_login_at = ?, created_at = ? WHERE email = ?', longAgo, longAgo, email)

    const listing = await directory('?filter=retention-window')
    expect(emails(listing)).toContain(email)
    expect(emails(listing)).not.toContain(officer.email)
    expect(listing.banners.insideRetentionWindow).toBeGreaterThanOrEqual(1)
  })

  // Two filters have no data to find until their stories exist, and say which one (A-116, A-117).
  test('a filter whose story is not built returns nothing and names it', async () => {
    for (const [filter, story] of [['members-current', 'A-117'], ['members-lapsed', 'A-117'], ['guests-unclaimed', 'A-116']] as const) {
      const listing = await directory(`?filter=${filter}`)
      expect(`${filter}: ${listing.awaiting}`).toBe(`${filter}: ${story}`)
    }
    expect((await directory('?filter=members-current')).total).toBe(0)
  })

  test('an unknown filter or an oversized page is refused', async () => {
    expect((await send('GET', '/api/admin/accounts?filter=nonsense', null, cookie)).status).toBe(400)
    expect((await send('GET', '/api/admin/accounts?pageSize=5000', null, cookie)).status).toBe(400)
  })

  test('someone without the permission cannot read the directory', async () => {
    const signedIn = await send('POST', '/api/auth/sign-in', { email: bystander.email, password })
    const theirs = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!
    expect((await send('GET', '/api/admin/accounts', null, theirs)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('creating an account from the console (A-121 criterion 3)', () => {
  test('it makes no password and sends a set-password link', async () => {
    const email = registrableAddress('invited')
    const created = await send('POST', '/api/admin/accounts', { email, name: 'Invited Person (test)', roles: ['BOX_OFFICE'] }, cookie)
    expect(created.status).toBe(200)
    expect(await created.json()).toMatchObject({ ok: true, invited: true })

    const account = read<{ password: string | null, verified: number }>('SELECT password, verified FROM users WHERE email = ?', email)!
    expect(account.password).toBeNull()

    const token = read<{ kind: string }>(`
      SELECT t.kind FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE u.email = ?
    `, email)
    expect(token?.kind).toBe('SET_PASSWORD')

    const sent = read<{ type: string, status: string }>(`
      SELECT l.type, l.status FROM notification_log l JOIN users u ON u.id = l.user_id WHERE u.email = ?
    `, email)
    expect(sent).toMatchObject({ type: 'account.set-password', status: 'SENT' })

    expect(emails(await directory('?filter=role-holders&role=BOX_OFFICE'))).toContain(email)
  })

  test('the link sets a first password, and then signs the person in', async () => {
    const email = registrableAddress('claiming')
    await send('POST', '/api/admin/accounts', { email, name: 'Claiming Person (test)', roles: [] }, cookie)

    const plaintext = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '')
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plaintext)))]
      .map(byte => byte.toString(16).padStart(2, '0')).join('')
    const id = read<{ id: string }>('SELECT id FROM users WHERE email = ?', email)!.id
    write('UPDATE auth_tokens SET token_hash = ? WHERE user_id = ? AND kind = ?', hash, id, 'SET_PASSWORD')

    const chosen = generatePassword()
    const set = await send('POST', '/api/auth/password/reset', { token: plaintext, password: chosen, kind: 'SET_PASSWORD' })
    expect(set.status).toBe(200)
    expect((await send('POST', '/api/auth/sign-in', { email, password: chosen })).status).toBe(200)
  })

  test('a second account on the same address is refused', async () => {
    const email = registrableAddress('twice')
    expect((await send('POST', '/api/admin/accounts', { email, name: 'Once (test)', roles: [] }, cookie)).status).toBe(200)
    expect((await send('POST', '/api/admin/accounts', { email, name: 'Twice (test)', roles: [] }, cookie)).status).toBe(409)
  })

  test('an address nothing could reach is refused rather than created', async () => {
    const refused = await send('POST', '/api/admin/accounts', { email: 'nobody@example.com', name: 'Nobody (test)', roles: [] }, cookie)
    expect(refused.status).toBe(400)
    expect(read('SELECT id FROM users WHERE email = ?', 'nobody@example.com')).toBeUndefined()
  })

  // A Workspace address is Google-only, so there is no password to set and no link to send.
  test('a Workspace address is created without an invitation', async () => {
    const email = `console-${crypto.randomUUID().slice(0, 8)}@newtheatre.org.uk`
    const created = await send('POST', '/api/admin/accounts', { email, name: 'Committee Person (test)', roles: [] }, cookie)
    expect(await created.json()).toMatchObject({ ok: true, invited: false })
    expect(read('SELECT t.id FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE u.email = ?', email)).toBeUndefined()
  })
})

describe.skipIf(skip !== null)('the directory screen', () => {
  test('an administrator searches, filters and adds someone', async () => {
    const known = await member('onscreen')
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', officer.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, 'document.querySelectorAll(\'[data-test="mfa-challenge"] input\').length >= 6')

      forgetSpentStep(app, officer.email)
      await fillPin(view, '[data-test="mfa-challenge"] input', await codeForStep(secret, stepFor(new Date())))
      await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')

      await visit(view, `${app.baseURL}/people/accounts`, '[data-test="toolbar-search"]')
      await waitFor(view, `document.body.innerText.includes(${JSON.stringify(known)})`)

      // Searching narrows to one, and the total below the table says so.
      await fill(view, 'input[data-test="toolbar-search"]', known)
      await waitFor(view, 'document.querySelector(\'[data-test="directory-total"]\')?.innerText.startsWith("1 ")')
      expect(await textOf(view)).not.toContain(officer.email)

      // Searching is shown back as a chip that can be taken off again (0032).
      await waitFor(view, `document.querySelector('[data-test="toolbar-active"]')?.innerText.includes(${JSON.stringify(known)})`)
      await click(view, '[data-test="toolbar-clear"]')
      await waitFor(view, 'document.querySelector(\'[data-test="toolbar-active"]\') === null')

      // The filters live behind one button, which is what keeps the row from resizing.
      await click(view, '[data-test="toolbar-filters"]')
      await waitFor(view, 'document.querySelector(\'[data-test="directory-filter"]\')')
      await view.evaluate(`document.querySelector('[data-test="toolbar-filters"]').click()`)
      await Bun.sleep(500)

      const invitee = registrableAddress('by-hand')
      await click(view, '[data-test="invite"]')
      await fill(view, '[data-test="invite-name"]', 'Added By Hand (test)')
      await fill(view, '[data-test="invite-email"]', invitee)
      await click(view, '[data-test="invite-submit"]')
      await waitFor(view, 'document.querySelector(\'[data-test="invited"]\')')

      expect(read('SELECT id FROM users WHERE email = ?', invitee)).toBeDefined()
    }
    finally {
      view.close()
    }
  }, 120_000)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
