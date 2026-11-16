// The parts of identity that touch the browser: cookies, the return path, the origin check and the
// relying party a passkey is bound to.
import { getCookie, getHeader, getRequestURL, setCookie, deleteCookie, type H3Event } from 'h3'
import { refuse } from '#kit'

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
    if (/[\u0000-\u001f\u007f\\]/.test(candidate)) return null
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

/** The site's own origin and host, which a passkey is bound to. */
export function relyingParty(event: H3Event): { origin: string, id: string } {
  const url = getRequestURL(event, { xForwardedHost: false, xForwardedProto: false })
  return { origin: url.origin, id: url.hostname }
}

/**
 * A change sent from another site is refused. Cookies are SameSite=Lax already; this is the second
 * lock, for browsers and paths where Lax does not hold.
 */
export function checkOrigin(event: H3Event): void {
  const method = event.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return
  const origin = getHeader(event, 'origin')
  if (!origin) return
  if (origin !== relyingParty(event).origin) refuse('core.access.wrong-origin', 'This request came from another site, so it was refused.', { status: 403 })
}

/** A short description of the browser for the sessions list, never the full user agent. */
export function deviceLabel(event: H3Event): string {
  const agent = getHeader(event, 'user-agent') ?? ''
  const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'A browser'
  const system = /iPhone|iPad/.test(agent) ? 'iOS' : /Android/.test(agent) ? 'Android' : /Mac OS X/.test(agent) ? 'macOS' : /Windows/.test(agent) ? 'Windows' : /Linux/.test(agent) ? 'Linux' : ''
  return system ? `${browser} on ${system}` : browser
}
