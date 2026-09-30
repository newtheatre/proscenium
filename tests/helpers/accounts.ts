import { Database } from 'bun:sqlite'
import { registrableAddress, syntheticPerson } from './seed'
import type { AppUnderTest } from './webview'

// One fixture for the accounts every suite needs. A signed-in member has to have proved its
// address (0026), and thirteen suites were each doing the registration by hand.

export interface TestMember {
  id: string
  email: string
  name: string
  cookie: string
}

export function request(app: AppUnderTest, method: string, path: string, body?: unknown, cookie?: string): Promise<Response> {
  const carriesBody = method !== 'GET' && method !== 'HEAD'
  return fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(carriesBody ? { body: JSON.stringify(body ?? {}) } : {}),
  })
}

export function query<T>(app: AppUnderTest, sql: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(sql).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

// Marked verified in the database rather than through the link: a suite that is not testing
// verification should not have to perform it, and the flow has its own tests.
export function markVerified(app: AppUnderTest, email: string): void {
  // The server writes to the same file, so a write from here can land mid-transaction and get
  // SQLITE_BUSY. Retried rather than failing a suite for something a moment fixes.
  for (let attempt = 0; ; attempt++) {
    const database = new Database(app.databaseFile)
    try {
      database.query('UPDATE users SET verified = 1 WHERE email = ?').run(email)
      return
    }
    catch (error) {
      if (attempt >= 40) throw error
      Bun.sleepSync(50)
    }
    finally {
      database.close()
    }
  }
}

// A spent step cannot answer a second challenge, so a suite signing in again either waits out the
// thirty second window or forgets the step. Replay protection has its own tests (A-111).
export function forgetSpentStep(app: AppUnderTest, email: string): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(`
      UPDATE totp_secrets SET last_used_step = NULL
      WHERE user_id = (SELECT id FROM users WHERE email = ?)
    `).run(email)
  }
  finally {
    database.close()
  }
}

// A duty manager shift needs a live committee role at claim and at use (0115). `COMMITTEE` asks for
// no second factor (A-112), so a fixture holding one tests the shift rather than the grant.
export function grantCommitteeRole(app: AppUnderTest, userId: string): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(`INSERT OR IGNORE INTO role_grants (id, user_id, role) VALUES (?, ?, 'COMMITTEE')`).run(`committee-${userId}`, userId)
  }
  finally {
    database.close()
  }
}

// The member's own authenticator, enrolled and confirmed through the routes, once: a second call
// answers the secret already held, which only this helper's first call can know.
const secrets = new Map<string, string>()

export async function enrolAuthenticator(app: AppUnderTest, member: TestMember): Promise<string> {
  const known = secrets.get(`${app.databaseFile}:${member.email}`)
  if (known) return known
  const { codeForStep, stepFor } = await import('#shared/utils/totp')
  const { secret } = await (await request(app, 'POST', '/api/account/mfa/enrol', {}, member.cookie)).json() as { secret: string }
  const confirmed = await request(app, 'POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, member.cookie)
  // Confirming ends every other session and reissues this one (A-109 criterion 3), so the member
  // carries the new cookie from here on, and every caller holding it sees the change.
  member.cookie = (confirmed.headers.get('set-cookie') ?? member.cookie).split(';')[0]!
  forgetSpentStep(app, member.email)
  secrets.set(`${app.databaseFile}:${member.email}`, secret)
  return secret
}

async function currentCode(app: AppUnderTest, email: string, secret: string): Promise<string> {
  const { codeForStep, stepFor } = await import('#shared/utils/totp')
  forgetSpentStep(app, email)
  return codeForStep(secret, stepFor(new Date()))
}

// Clears one address's sign-in attempts, the bucket `server/api/auth/sign-in.post.ts` counts.
export function forgetSignInAttempts(app: AppUnderTest, email: string): void {
  const database = new Database(app.databaseFile)
  try {
    database.run('PRAGMA busy_timeout = 10000')
    database.query('DELETE FROM rate_limits WHERE key = ?').run(`sign-in:${email.trim().toLowerCase()}`)
  }
  finally {
    database.close()
  }
}

// A password sign-in through the routes, answering the challenge for a member this file enrolled;
// the answer carrying the session cookie is what comes back.
export async function signInCookie(app: AppUnderTest, email: string, password: string): Promise<Response> {
  forgetSignInAttempts(app, email)
  const signedIn = await request(app, 'POST', '/api/auth/sign-in', { email, password })
  const secret = secrets.get(`${app.databaseFile}:${email}`)
  if (!secret || signedIn.headers.get('set-cookie')) return signedIn
  const { attemptId } = await signedIn.json() as { attemptId: string }
  return request(app, 'POST', '/api/auth/mfa/challenge', { attemptId, code: await currentCode(app, email, secret) })
}

// After the password on the sign-in form: an enrolled member is asked for a code, which this
// answers; either way it returns once the account menu shows.
export async function finishSignIn(app: AppUnderTest, view: Bun.WebView, email: string): Promise<void> {
  const { click, fillPin, waitFor } = await import('./webview')
  const menu = `document.querySelector('[data-test="account-menu"]')`
  const asked = `document.querySelectorAll('[data-test="mfa-challenge"] input').length >= 6`
  const limited = `document.body.innerText.includes('Too many attempts')`
  await waitFor(view, `${menu} || ${asked} || ${limited}`)
  // A suite signs one officer in more often than a person would; A-103's own limit has its own suite.
  if (await view.evaluate<boolean>(`Boolean(${limited})`)) {
    forgetSignInAttempts(app, email)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `${menu} || ${asked}`)
  }
  const secret = secrets.get(`${app.databaseFile}:${email}`)
  if (secret && await view.evaluate(`Boolean(${asked})`)) {
    await fillPin(view, '[data-test="mfa-challenge"] input', await currentCode(app, email, secret))
  }
  await waitFor(view, menu)
}

// A role on the second-factor list is refused on every screen until its holder has an
// authenticator (A-112), so a privileged grant enrols one first; the live list, if overridden.
export async function grantRole(app: AppUnderTest, member: TestMember, role: string, as: string): Promise<Response> {
  const { CONFIG_KEYS } = await import('#shared/utils/config')
  const stored = query<{ value: string }>(app, `SELECT value FROM config WHERE key = 'PRIVILEGED_ROLES'`)
  const privileged = stored ? JSON.parse(stored.value) as string[] : CONFIG_KEYS.PRIVILEGED_ROLES.default as readonly string[]
  // A member with no session never meets the guard in the test, and has none to enrol from.
  if (privileged.includes(role) && member.cookie) await enrolAuthenticator(app, member)
  return request(app, 'POST', '/api/admin/roles', { userId: member.id, role }, as)
}

export interface RegisterOptions {
  /** Leave the address unproven, for a suite that is testing what that refuses. */
  verify?: boolean
  /** Stop before signing in, for a suite that wants to drive that itself. */
  signIn?: boolean
}

export async function registerMember(
  app: AppUnderTest,
  prefix: string,
  password: string,
  options: RegisterOptions = {},
): Promise<TestMember> {
  const { verify = true, signIn = true } = options
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = registrableAddress(prefix)

  await request(app, 'POST', '/api/auth/register', { email, name: person.name, password })
  if (verify) markVerified(app, email)

  const id = query<{ id: string }>(app, 'SELECT id FROM users WHERE email = ?', email)!.id
  if (!signIn) return { id, email, name: person.name, cookie: '' }

  const signedIn = await request(app, 'POST', '/api/auth/sign-in', { email, password })
  return { id, email, name: person.name, cookie: (signedIn.headers.get('set-cookie') ?? '').split(';')[0]! }
}

export interface AdminOptions {
  // Empty grants nothing, for checking that a guard refuses somebody ordinary.
  roles?: 'ADMIN'[]
}

// A privileged session is four steps, not one: a role carrying a permission needs a second factor
// before a guard honours it (A-112), and four suites were each doing that by hand.
export async function adminSession(app: AppUnderTest, options: AdminOptions = {}): Promise<TestMember> {
  const { codeForStep, stepFor } = await import('#shared/utils/totp')
  const { generatePassword } = await import('./seed')
  const { roles = ['ADMIN'] } = options

  const password = generatePassword()
  const member = await registerMember(app, roles.length ? 'officer' : 'stranger', password)
  if (roles.length === 0) return member

  const { secret } = await (await request(app, 'POST', '/api/account/mfa/enrol', {}, member.cookie)).json() as { secret: string }
  await request(app, 'POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, member.cookie)

  Bun.spawnSync(['bun', 'scripts/grant-admin.ts', member.email, app.databaseFile])
  forgetSpentStep(app, member.email)

  const { attemptId } = await (await request(app, 'POST', '/api/auth/sign-in', { email: member.email, password })).json() as { attemptId: string }
  const answered = await request(app, 'POST', '/api/auth/mfa/challenge', {
    attemptId,
    code: await codeForStep(secret, stepFor(new Date())),
  })

  return { ...member, cookie: (answered.headers.get('set-cookie') ?? '').split(';')[0]! }
}
