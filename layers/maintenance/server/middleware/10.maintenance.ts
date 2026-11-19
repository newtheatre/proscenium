// Maintenance mode's gate. While the module is on, a request from anybody who is not staff for an
// address it does not leave open gets 503 with Retry-After: a page gets the holding page, the API a
// refusal, so search engines keep the pages they know and browsers do not keep the holding page.
// Staff are those the console, Admin or live mode is open to, so the door, the till and the scanner
// keep working. Before anything is read, an address that is always open goes straight on.
import { defineEventHandler, getRequestURL, setResponseHeader, setResponseStatus } from 'h3'
import { isEnabled, runInContext, usePoint, type KitEnv } from '#kit'
import { useAccessProvider } from '#kit/access'
import { requestCache } from '#kit/route'
import { holdsAdmin, holdsConsole, holdsLive } from '#modules/core'
import { isApi, isOpenAddress } from '../../shared/addresses'
import { noticePage, retryAfter } from '../notice'

const SERVICE_UNAVAILABLE = 503 // not-policy: HTTP's status for a site closed for a while

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (isOpenAddress(path)) return
  const env = (event.context as { cloudflare?: { env?: KitEnv } }).cloudflare?.env
  if (!env?.DB) return // prerendering: nothing is closed while the site is built
  const answer = await runInContext({ env, cache: requestCache(event) }, async () => {
    if (!(await isEnabled('maintenance'))) return null
    const contributed = (await usePoint<{ prefix: string }>('maintenance.open-address')).map(c => c.value.prefix)
    if (isOpenAddress(path, contributed)) return null
    const actor = await useAccessProvider().actor(event)
    if (actor.kind === 'person' && ((await holdsConsole(actor)) || (await holdsAdmin(actor)) || (await holdsLive(actor)))) return null
    const wait = await retryAfter()
    const page = isApi(path) || !['GET', 'HEAD'].includes(event.method.toUpperCase()) ? null : await noticePage()
    return { wait, page }
  })
  if (!answer) return
  setResponseStatus(event, SERVICE_UNAVAILABLE)
  setResponseHeader(event, 'retry-after', answer.wait)
  setResponseHeader(event, 'cache-control', 'no-store')
  if (answer.page === null) {
    setResponseHeader(event, 'content-type', 'application/json')
    return { code: 'maintenance.closed', reason: 'The site is closed for maintenance for a while.', remedy: 'Try again later, or contact the box office.' }
  }
  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
  return event.method.toUpperCase() === 'HEAD' ? '' : answer.page
})
