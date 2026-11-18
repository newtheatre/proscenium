// Identity's test harness: every core route mounted as Nitro would mount it, a browser with a
// cookie jar, a mailbox that captures sign-in emails, the bot check answered, and quick ways to
// seed people, roles and grants.
import { vi } from 'vitest'
import type { EventHandler } from 'h3'
import { setAccessProvider } from '#kit/access'
import { resetRateLimits } from '#kit/ratelimit'
import { newId } from '#kit/ids'
import { server, deliver, env, testAccess } from '../../../../../tests/integration/helpers'
import { identityAccess } from '../../../server/identity/access'
import { setMailer } from '../../../server/notifications/mailer'
import { Authenticator } from './authenticator'

const files = import.meta.glob<{ default: EventHandler }>('../../../server/api/core/**/*.ts', { eager: true })

/** Every core route, keyed "METHOD /path/:param" from its file name. */
export const routes: Record<string, EventHandler> = {}
for (const [file, module] of Object.entries(files)) {
  const match = /server\/api\/(.*?)(?:\.(get|post|put|patch|delete))?\.ts$/.exec(file)!
  const path = `/api/${match[1]!.replace(/\/index$/, '').replace(/\[([^\]]+)\]/g, ':$1')}`
  routes[`${(match[2] ?? 'get').toUpperCase()} ${path}`] = module.default
}
export const handle = server(routes)

/** A sign-in email as a test reads it: the address, and the link and code taken from its text. */
export interface SignInMessage { address: string, subject: string, variables: { link: string, code: string }, text?: string }

export const mailbox: SignInMessage[] = []

/** Installs identity's real access provider, the mailbox and a passing bot check. Call in beforeAll. */
export async function useIdentity(): Promise<void> {
  setAccessProvider(identityAccess)
  // The core domain sends only from a verified domain.
  for (const [key, value] of Object.entries({ 'core.notifications.sending-domain': 'mail.example.org', 'core.notifications.verified-domain': 'mail.example.org', 'core.organisation.contact-email': 'box-office@example.org', 'core.site.name': 'The Test Theatre' }))
    await setSetting(key, value)
  setMailer(async (email) => {
    const link = /(https?:\/\/\S+\/sign-in\/link#[\w-]+)/.exec(email.text)?.[1] ?? ''
    const code = /\b(\d{6})\b/.exec(email.text)?.[1] ?? ''
    mailbox.push({ address: email.to, subject: email.subject, variables: { link, code }, text: email.text })
    return {}
  })
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.includes('challenges.cloudflare.com')) {
      const token = (init?.body as FormData | undefined)?.get('response')
      return Response.json({ success: token === 'pass' })
    }
    return googleStub(url, init)
  })
}

let googleStub: (url: string, init?: RequestInit) => Promise<Response> = async () => new Response('not stubbed', { status: 500 })
export function stubGoogle(fn: typeof googleStub): void {
  googleStub = fn
}

export function leaveIdentity(): void {
  setAccessProvider(testAccess)
  setMailer(undefined)
  vi.restoreAllMocks()
}

export function reset(): void {
  resetRateLimits()
  mailbox.length = 0
}

/** A browser: keeps its cookies and sends this site's Origin, as a real one would. */
export class Browser {
  cookies = new Map<string, string>()
  constructor(public origin = 'https://test') {}

  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const sent: Record<string, string> = { 'content-type': 'application/json', 'host': 'test', 'origin': this.origin, ...headers }
    if (this.cookies.size) sent.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    const response = await handle(new Request(`https://test${path}`, { method, headers: sent, body: body === undefined ? undefined : JSON.stringify(body) }))
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(';')
      const [name, ...rest] = pair!.split('=')
      const value = rest.join('=')
      const expired = attributes.some(a => /max-age=0/i.test(a.trim()) || /expires=thu, 01 jan 1970/i.test(a.trim()))
      if (!value || expired) this.cookies.delete(name!.trim())
      else this.cookies.set(name!.trim(), value)
    }
    const text = await response.text()
    let json: any
    try {
      json = text ? JSON.parse(text) : null
    }
    catch {
      json = text
    }
    return { status: response.status, body: json, headers: response.headers }
  }

  get = (path: string) => this.call('GET', path)
  post = (path: string, body: unknown = {}, headers?: Record<string, string>) => this.call('POST', path, body, headers)
  put = (path: string, body: unknown = {}) => this.call('PUT', path, body)
  patch = (path: string, body: unknown = {}) => this.call('PATCH', path, body)
  delete = (path: string) => this.call('DELETE', path, {})
}

export const address = () => `p${crypto.randomUUID().slice(0, 12)}@example.org`

/** Asks for a link and code, runs the queued email job, and returns what was sent. */
export async function emailSignIn(browser: Browser, to: string, next?: string): Promise<{ status: number, body: any, message?: SignInMessage }> {
  const before = mailbox.length
  const asked = await browser.post('/api/core/sign-in/email', { address: to, ...(next ? { next } : {}) }, { 'cf-turnstile-response': 'pass' })
  await deliver()
  // Security notices to the same address land in the mailbox too; the sign-in email is the one with a link.
  return { ...asked, message: mailbox.slice(before).find(m => m.address === to && m.variables.link) }
}

export function tokenOf(message: SignInMessage): string {
  return message.variables.link.split('#')[1]!
}

/** Signs a browser in by emailed link, making the account if need be. Returns the account id. */
export async function signInByEmail(browser: Browser, to = address()): Promise<string> {
  const { message } = await emailSignIn(browser, to)
  const used = await browser.post('/api/core/sign-in/link', { token: tokenOf(message!) })
  if (used.status !== 200) throw new Error(`sign-in failed: ${JSON.stringify(used.body)}`)
  return (await browser.get('/api/core/me')).body.account.id
}

/** Adds a passkey to the signed-in account of this browser; returns the recovery codes if any. */
export async function addPasskey(browser: Browser, device: Authenticator): Promise<string[] | undefined> {
  const options = await browser.post('/api/core/me/passkeys/options')
  if (options.status !== 200) throw new Error(`passkey options failed: ${JSON.stringify(options.body)}`)
  const added = await browser.post('/api/core/me/passkeys', { challengeId: options.body.challengeId, response: await device.create(options.body.options) })
  if (added.status !== 200) throw new Error(`passkey add failed: ${JSON.stringify(added.body)}`)
  return added.body.recoveryCodes
}

export async function passkeySignIn(browser: Browser, device: Authenticator, next?: string) {
  const options = await browser.post('/api/core/sign-in/passkey/options')
  return browser.post('/api/core/sign-in/passkey', { challengeId: options.body.challengeId, response: await device.get(options.body.options), ...(next ? { next } : {}) })
}

export async function reassert(browser: Browser, device: Authenticator) {
  const options = await browser.post('/api/core/me/reassert/options')
  return browser.post('/api/core/me/reassert', { challengeId: options.body.challengeId, response: await device.get(options.body.options) })
}

/** Runs first-run setup in a browser and returns the Owner's account id. */
export async function setUpOwner(browser: Browser, device: Authenticator, to = address(), theatre: { theatre?: string, timeZone?: string } = {}): Promise<string> {
  const start = await browser.post('/api/core/setup/start', { name: 'Olive Owner', address: to, ...theatre })
  if (start.status !== 200) throw new Error(`setup start failed: ${JSON.stringify(start.body)}`)
  const passkey = await browser.post('/api/core/setup/passkey', { response: await device.create(start.body.options) })
  const finished = await browser.post('/api/core/setup/finish', { code: passkey.body.recoveryCodes[0] })
  if (finished.status !== 200) throw new Error(`setup finish failed: ${JSON.stringify(finished.body)}`)
  return (await browser.get('/api/core/me')).body.account.id
}

/** A signed-in person with a passkey, strong and fresh: staff ready for the console. */
export async function staff(): Promise<{ browser: Browser, device: Authenticator, accountId: string }> {
  const browser = new Browser()
  const device = new Authenticator()
  const accountId = await signInByEmail(browser)
  await addPasskey(browser, device)
  return { browser, device, accountId }
}

/** Gives an account a role holding these abilities, directly in the database. */
export async function grantDirectly(accountId: string, abilities: string[], options: { roleKey?: string, roleId?: string } = {}): Promise<{ roleId: string, grantId: string }> {
  const roleId = options.roleId ?? newId('rol')
  const at = Date.now()
  if (!options.roleId) {
    await env.DB.prepare('INSERT INTO core_roles (id, key, name, fixed, opens_members_area, needs_managed_identity, expiry_rule, created_at) VALUES (?, ?, ?, ?, 1, 0, \'none\', ?)')
      .bind(roleId, options.roleKey ?? `role-${roleId.slice(-10)}`, options.roleKey ?? 'Test role', options.roleKey === 'owner' ? 1 : 0, at).run()
    for (const ability of abilities) await env.DB.prepare('INSERT INTO core_role_abilities (role_id, ability) VALUES (?, ?)').bind(roleId, ability).run()
  }
  const grantId = newId('gra')
  await env.DB.prepare('INSERT INTO core_grants (id, account_id, role_id, scope, starts_at, granted_by, granted_at) VALUES (?, ?, ?, \'site\', ?, \'acc_testgranter\', ?)').bind(grantId, accountId, roleId, at - 1000, at - 1000).run() // not-policy: a moment ago
  return { roleId, grantId }
}

export { env, deliver }

export async function setSetting(key: string, value: unknown): Promise<void> {
  await env.DB.prepare('INSERT INTO core_settings (key, value, updated_at) VALUES (?, ?, 0) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(value)).run()
}

export async function clearSetting(key: string): Promise<void> {
  await env.DB.prepare('DELETE FROM core_settings WHERE key = ?').bind(key).run()
}

/** Makes the browser's session look as if it was last re-asserted long ago. */
export async function goStale(accountId: string): Promise<void> {
  await env.DB.prepare('UPDATE core_sessions SET reasserted_at = 1 WHERE account_id = ?').bind(accountId).run()
}

/** An account that was made (say by a guest checkout) but has never signed in. */
export async function unclaimedAccount(to = address()): Promise<string> {
  const id = newId('acc')
  const emailId = newId('aem')
  await env.DB.batch([
    env.DB.prepare('INSERT INTO core_accounts (id, name, origin, created_at, audience_email_id) VALUES (?, \'Gail Guest\', \'guest\', ?, ?)').bind(id, Date.now(), emailId),
    env.DB.prepare('INSERT INTO core_account_emails (id, account_id, address, verified_at, added_by, created_at) VALUES (?, ?, ?, NULL, \'checkout\', ?)').bind(emailId, id, to, Date.now()),
  ])
  return id
}
