// The starting colour mode, decided before the page renders (core.appearance.default and
// core.appearance.let-people-choose; the rule is modeToApply in shared/appearance.ts). The mode is
// written to the colour-mode cookie on the response, which the browser has stored by the time the
// page's first script reads it, and into this request's own cookies, so the server render agrees.
import { defineEventHandler, getCookie, getHeader, getRequestURL, setCookie } from 'h3'
import { runInContext, useSetting, type KitEnv } from '#kit'
import { requestCache } from '#kit/route'
import { CHOSEN_KEY, MODE_COOKIE_AGE, MODE_KEY, modeToApply } from '../../shared/appearance'

/** Addresses that are never a page: the API, stored files and the build's own assets. */
const NOT_A_PAGE = /^\/(api|files|_nuxt|__nuxt|_ipx|cdn-cgi)(\/|$)|\.\w+$/

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET' || NOT_A_PAGE.test(getRequestURL(event).pathname)) return
  if (!(getHeader(event, 'accept') ?? '').includes('text/html')) return
  const env = (event.context as { cloudflare?: { env?: KitEnv } }).cloudflare?.env
  if (!env?.DB) return // prerendering: no settings to read, so the browser's own cookie stands
  const mode = await runInContext({ env, cache: requestCache(event) }, async () => modeToApply({
    start: await useSetting('core.appearance.default'),
    mayChoose: await useSetting('core.appearance.let-people-choose') !== false,
    stored: getCookie(event, MODE_KEY),
    chosen: !!getCookie(event, CHOSEN_KEY),
  }))
  if (!mode) return
  setCookie(event, MODE_KEY, mode, { path: '/', maxAge: MODE_COOKIE_AGE, sameSite: 'lax' })
  const others = (getHeader(event, 'cookie') ?? '').split(/;\s*/).filter(c => c && !c.startsWith(`${MODE_KEY}=`))
  event.node.req.headers.cookie = [...others, `${MODE_KEY}=${mode}`].join('; ')
})
