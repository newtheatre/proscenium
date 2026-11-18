// The address of a page of this site, for a link in a message. This is the one place Box office
// builds one. It stands in for the kit's siteUrl(path) (Foundations part 4, "The site's public
// address"), which reads the setting core.site.origin: when the kit has it, this file goes, its
// callers import the kit's, and no route calls fromRequest. Until then the address is the one the
// request came to, which a route notes before its service runs. A payment is settled by a job with
// no request to take it from, so the first address noted is remembered for that, and never
// replaced: a later request on another host cannot change where those messages point.
//
// The kit's address is asked first: the one the site has recorded, or the request's own. So a
// reservation paid at the till can be confirmed on a site where no booking has yet been made
// online, which is where a theatre that brought its bookings from another system starts.
import type { H3Event } from 'h3'
import { cache, siteUrl as kitSiteUrl, useContext } from '#kit'
import { relyingParty } from '#modules/core'

const KEY = 'box-office:site-origin'

export async function fromRequest(event: H3Event): Promise<void> {
  const origin = (await relyingParty(event)).origin
  useContext().cache[KEY] = origin
  if (await cache.get<string>(KEY) === null) await cache.put(KEY, origin)
}

export async function siteUrl(path: string): Promise<string> {
  try {
    return await kitSiteUrl(path)
  }
  catch (error: any) {
    // No address recorded and no request at hand: the one a route noted earlier serves.
    if (error?.code !== 'core.site.origin-unset') throw error
  }
  const origin = useContext().cache[KEY] ?? await cache.get<string>(KEY)
  if (typeof origin !== 'string') throw new Error('No site address: no request has been noted yet')
  return `${origin}${path}`
}
