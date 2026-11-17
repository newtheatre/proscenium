// The parts of identity that touch the browser: cookies, the return path, the origin check and the
// relying party a passkey is bound to.
import { getCookie, getHeader, setCookie, deleteCookie, type H3Event } from 'h3'
import { refuse } from '#kit'
import { configuredOrigin, requestUrl } from '#kit/origin'

/** The session. `__Host-` keeps it to this exact host, over HTTPS, for every path. */
export const SESSION_COOKIE = '__Host-proscenium-session'
// Binds an emailed code to the browser that asked for it (ID-01).
export const BROWSER_COOKIE = '__Host-proscenium-browser'
/** Carries first-run setup between its steps, sealed. */
export const SETUP_COOKIE = '__Host-proscenium-setup'
/** Carries Google's state, nonce and verifier between the redirect and the callback, sealed. */
export const PROVIDER_COOKIE = '__Host-proscenium-provider'

const MAX_PATH = 512 // not-policy: a return path is a short path on this site

/**
 * The page to return to after signing in (ID-07): a path on this site, or nothing. Anything that
 * could leave the site, written plainly or encoded, is dropped.
 */
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_PATH) return null
  let decoded = raw
  for (let i = 0; i < 3; i++) { // not-policy: undo layered encoding a few times, then stop
    try {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    }
    catch {
      return null
    }
  }
  for (const candidate of [raw, decoded]) {
    if (!candidate.startsWith('/')) return null
    if (candidate.startsWith('//') || candidate.startsWith('/\\')) return null
    if ([...candidate].some(c => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f || c === '\\')) return null // not-policy: control characters and backslashes
    if (/^\/[a-z][a-z0-9+.-]*:/i.test(candidate)) return null // not-policy: a scheme's characters
  }
  try {
    const url = new URL(raw, 'https://site.invalid')
    if (url.origin !== 'https://site.invalid') return null
    return `${url.pathname}${url.search}${url.hash}`
  }
  catch {
    return null
  }
}

export function setSessionCookie(event: H3Event, token: string, maxAgeSeconds: number): void {
  setCookie(event, SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: maxAgeSeconds })
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' })
}

export function setShortCookie(event: H3Event, name: string, value: string, maxAgeSeconds: number): void {
  setCookie(event, name, value, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: maxAgeSeconds })
}

export function readCookie(event: H3Event, name: string): string | undefined {
  return getCookie(event, name) || undefined
}

export function clearCookie(event: H3Event, name: string): void {
  deleteCookie(event, name, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' })
}

/**
 * The site's own origin and host, which a passkey is bound to: the recorded origin (core.site.origin,
 * or CORE_SITE_ORIGIN), or the request's own until one is recorded. The request's address comes from
 * the Worker's own request, which carries the scheme the browser used; Nitro's stand-in does not.
 */
export async function relyingParty(event: H3Event): Promise<{ origin: string, id: string }> {
  const origin = (await configuredOrigin())?.origin ?? requestUrl(event).origin
  return { origin, id: new URL(origin).hostname }
}

/**
 * Not checked by host: a provider's webhook (authenticated by its signature) and first-run setup
 * (Foundations part 4, "One origin, enforced").
 */
export const NOT_HOST_CHECKED = /^\/(api\/[a-z0-9-]+\/webhooks|api\/core\/setup|setup)(\/|$)/ // not-policy: a pattern of addresses

/**
 * A change sent from another site is refused. Cookies are SameSite=Lax already; this is the second
 * lock, for browsers and paths where Lax does not hold.
 */
export async function checkOrigin(event: H3Event): Promise<void> {
  const method = event.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return
  if (NOT_HOST_CHECKED.test(requestUrl(event).pathname)) return
  // Once an origin is recorded, a change sent on any other host is refused, even with no Origin header.
  const configured = await configuredOrigin()
  if (configured && requestUrl(event).origin !== configured.origin) refuse('core.access.wrong-origin', 'Changes are made on the site\'s own address, so this one was refused.', { status: 403, remedy: `Use ${configured.origin}.` })
  const origin = getHeader(event, 'origin')
  if (!origin) return
  if (origin !== (await relyingParty(event)).origin) refuse('core.access.wrong-origin', 'This request came from another site, so it was refused.', { status: 403 })
}

/** A short description of the browser for the sessions list, never the full user agent. */
export function deviceLabel(event: H3Event): string {
  const agent = getHeader(event, 'user-agent') ?? ''
  const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'A browser'
  const system = /iPhone|iPad/.test(agent) ? 'iOS' : /Android/.test(agent) ? 'Android' : /Mac OS X/.test(agent) ? 'macOS' : /Windows/.test(agent) ? 'Windows' : /Linux/.test(agent) ? 'Linux' : ''
  return system ? `${browser} on ${system}` : browser
}
