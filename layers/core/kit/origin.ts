// The site's one public origin (Foundations part 4, "The site's public address" and "One origin,
// enforced"). It comes from the Worker variable CORE_SITE_ORIGIN when that is set (the escape for a
// lost old address), else from the setting core.site.origin, which setup records and an
// administrator changes with a confirmation. Never from a forwarded header. Until either is set, a
// request's own address stands in, and work outside a request cannot build an address.
import { getRequestURL, type H3Event } from 'h3'
import { useContext } from './context'
import { currentContext } from './context-store'
import { Refusal } from './refusal'
import { useSetting } from './settings-store'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** An origin as the kit stores it (https://host[:port]), or null if the text is not one. Plain http only for this machine. */
export function normaliseOrigin(text: unknown): string | null {
  if (typeof text !== 'string' || !text.trim()) return null
  try {
    const url = new URL(text.trim())
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) return null
    if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return null
    return url.origin
  }
  catch {
    return null
  }
}

/** The address a request arrived on, from the Worker's own request, never from forwarded headers. */
export function requestUrl(event: H3Event): URL {
  // Nitro's local fetches during a page render share the platform object, so they see the outer request.
  const request = (event.context.cloudflare as { request?: Request } | undefined)?.request ?? (event as unknown as { req?: Request }).req
  return request ? new URL(request.url) : getRequestURL(event, { xForwardedHost: false, xForwardedProto: false })
}

export interface ConfiguredOrigin { origin: string, from: 'variable' | 'setting' }

/** The recorded origin, and where it comes from; null while neither the variable nor the setting is set. */
export async function configuredOrigin(): Promise<ConfiguredOrigin | null> {
  const variable = normaliseOrigin(useContext().env.CORE_SITE_ORIGIN)
  if (variable) return { origin: variable, from: 'variable' }
  const setting = normaliseOrigin(await useSetting('core.site.origin'))
  return setting ? { origin: setting, from: 'setting' } : null
}

/**
 * The site's origin. While none is recorded, the current request's own; outside a request it
 * refuses with core.site.origin-unset, and a job that meets that refusal is deferred.
 */
export async function siteOrigin(): Promise<string> {
  const configured = await configuredOrigin()
  if (configured) return configured.origin
  const fromRequest = currentContext()?.requestOrigin
  if (fromRequest) return fromRequest
  throw new Refusal('core.site.origin-unset', "The site's address has not been recorded yet, so no link can be built outside a request.", { status: 409, remedy: 'Record the address on the Health screen.' })
}

/** An absolute address on the site's origin, for a path that starts with one slash. */
export async function siteUrl(path: string): Promise<string> {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error(`siteUrl takes a path that starts with one /, not "${path}"`)
  return `${await siteOrigin()}${path}`
}
