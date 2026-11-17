// One origin, enforced (Foundations part 4). Once the site's origin is recorded, a read on any other
// host (the workers.dev address, a preview deployment, an old domain) is redirected to the same path
// on the origin, so nobody browses a second host and then finds every change refused there; the
// change itself is refused by identity's origin check. Not redirected: the platform's health probe,
// a provider's webhook and first-run setup. Before an origin is recorded nothing is redirected.
import { defineEventHandler, sendRedirect } from 'h3'
import { runInContext, type KitEnv } from '#kit'
import { requestCache } from '#kit/route'
import { configuredOrigin, requestUrl } from '#kit/origin'
import { NOT_HOST_CHECKED } from '../identity/web'

const HEALTH_PROBE = /^\/(api\/core\/health|cdn-cgi)(\/|$)/

export default defineEventHandler(async (event) => {
  const method = event.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return
  const url = requestUrl(event)
  if (HEALTH_PROBE.test(url.pathname) || NOT_HOST_CHECKED.test(url.pathname)) return
  const env = (event.context as { cloudflare?: { env?: KitEnv } }).cloudflare?.env
  if (!env?.DB) return // prerendering: there is no other host to leave
  const configured = await runInContext({ env, cache: requestCache(event) }, () => configuredOrigin())
  if (!configured || configured.origin === url.origin) return
  // Temporary, so a browser does not keep the redirect if the site moves back.
  return sendRedirect(event, `${configured.origin}${url.pathname}${url.search}`, 307) // not-policy: HTTP temporary redirect
})
