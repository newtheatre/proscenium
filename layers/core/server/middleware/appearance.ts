// The starting colour mode, decided before the page renders (core.appearance.default and
// core.appearance.let-people-choose; the rule is modeToApply in shared/appearance.ts). The mode is
// written to the colour-mode cookie on the response, which the browser has stored by the time the
// page's first script reads it, and into this request's own cookies, so the server render agrees.
import { bindings } from '#kit/bindings'
import { defineHandler, getCookie, getRequestHeader, getRequestURL, setCookie } from 'nuxt/server'
import { runInContext, useSetting, type KitEnv } from '#kit'
import { requestCache } from '#kit/route'
import { CHOSEN_KEY, MODE_COOKIE_AGE, MODE_KEY, modeToApply } from '../../shared/appearance'

/** Addresses that are never a page: the API, stored files and the build's own assets. */
const NOT_A_PAGE = /^\/(api|files|_nuxt|__nuxt|_ipx|cdn-cgi)(\/|$)|\.\w+$/

export default defineHandler(async (event) => {
  if (event.req.method !== 'GET' || NOT_A_PAGE.test(getRequestURL(event).pathname)) return
  if (!(getRequestHeader(event, 'accept') ?? '').includes('text/html')) return
  const env = bindings(event)
  if (!env?.DB) return // prerendering: no settings to read, so the browser's own cookie stands
  const mode = await runInContext({ env, cache: requestCache(event) }, async () => modeToApply({
    start: await useSetting('core.appearance.default'),
    mayChoose: await useSetting('core.appearance.let-people-choose') !== false,
    stored: getCookie(event, MODE_KEY),
    chosen: !!getCookie(event, CHOSEN_KEY),
  }))
  if (!mode) return
  setCookie(event, MODE_KEY, mode, { path: '/', maxAge: MODE_COOKIE_AGE, sameSite: 'lax' })
  // The page's own render reads the mode from the request (app/middleware/appearance.global.ts).
  event.context.appearance = mode
})
