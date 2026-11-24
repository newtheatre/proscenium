// Maintenance mode's gate. While the module is on, a request from anybody who is not staff for an
// address it does not leave open gets 503 with Retry-After: a page gets the holding page, the API a
// refusal, so search engines keep the pages they know and browsers do not keep the holding page.
// Staff are those the console, Admin or live mode is open to, so the door, the till and the scanner
// keep working. Before anything is read, an address that is always open goes straight on.
//
// A new site is closed from its first deploy: until first-run setup switches the module on (or
// anybody switches it either way), it counts as on while the site has no Owner, and the holding
// page points whoever is installing it to setup.
import { bindings } from '#kit/bindings'
import { defineHandler, getRequestURL, setResponseStatus } from 'nuxt/server'
import { isEnabled, runInContext, usePoint, type KitEnv } from '#kit'
import { everSwitched } from '#kit/modules-store'
import { useAccessProvider } from '#kit/access'
import { requestCache } from '#kit/route'
import { holdsAdmin, holdsConsole, holdsLive, setupNeeded } from '#modules/core'
import { isApi, isOpenAddress } from '../../shared/addresses'
import { noticePage, retryAfter } from '../notice'

const SERVICE_UNAVAILABLE = 503 // not-policy: HTTP's status for a site closed for a while

export default defineHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (isOpenAddress(path)) return
  const env = bindings(event)
  if (!env?.DB) return // prerendering: nothing is closed while the site is built
  const answer = await runInContext({ env, cache: requestCache(event) }, async () => {
    const firstRun = !(await isEnabled('maintenance')) && !(await everSwitched('maintenance')) && await setupNeeded()
    if (!firstRun && !(await isEnabled('maintenance'))) return null
    const contributed = (await usePoint<{ prefix: string }>('maintenance.open-address')).map(c => c.value.prefix)
    if (isOpenAddress(path, contributed)) return null
    const actor = await useAccessProvider().actor(event)
    if (actor.kind === 'person' && ((await holdsConsole(actor)) || (await holdsAdmin(actor)) || (await holdsLive(actor)))) return null
    const wait = await retryAfter()
    const page = isApi(path) || !['GET', 'HEAD'].includes(event.req.method.toUpperCase()) ? null : await noticePage({ setup: firstRun })
    return { wait, page }
  })
  if (!answer) return
  setResponseStatus(event, SERVICE_UNAVAILABLE)
  event.res.headers.set('retry-after', String(answer.wait))
  event.res.headers.set('cache-control', 'no-store')
  if (answer.page === null) {
    event.res.headers.set('content-type', 'application/json')
    return { code: 'maintenance.closed', reason: 'The site is closed for maintenance for a while.', remedy: 'Try again later, or contact the box office.' }
  }
  event.res.headers.set('content-type', 'text/html; charset=utf-8')
  return event.req.method.toUpperCase() === 'HEAD' ? '' : answer.page
})
