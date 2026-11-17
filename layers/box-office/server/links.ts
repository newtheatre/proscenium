// The address of a page of this site, for a link in a message. This is the one place Box office
// builds one. It stands in for the kit's siteUrl(path) (Foundations part 4, "The site's public
// address"), which reads the setting core.site.origin: when the kit has it, this file goes, its
// callers import the kit's, and no route calls fromRequest. Until then the address is the one the
// request came to, which a route notes before its service runs.
import type { H3Event } from 'h3'
import { useContext } from '#kit'
import { relyingParty } from '#modules/core'

const KEY = 'box-office.site-origin'

export async function fromRequest(event: H3Event): Promise<void> {
  useContext().cache[KEY] = (await relyingParty(event)).origin
}

export function siteUrl(path: string): string {
  const origin = useContext().cache[KEY]
  if (typeof origin !== 'string') throw new Error('No site address: the route did not note the request')
  return `${origin}${path}`
}
