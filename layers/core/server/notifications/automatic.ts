// C-52: what setting the sending domain up automatically would do on this site, for the sender
// screen and the set-up route. The domain is the sending label before the site's own host, so a
// site at tickets.example.org sends from mail.tickets.example.org. A host starting www. drops it.
import type { H3Event } from 'h3'
import { useSetting } from '#kit'
import { relyingParty } from '../identity/web'
import { cloudflareToken } from './cloudflare'

export type Unavailable = 'no-token' | 'workers-dev' | 'local'

export async function automaticPlan(event: H3Event): Promise<{ host: string, proposed: string | null, unavailable: Unavailable | null }> {
  const host = (await relyingParty(event)).id.toLowerCase()
  const label = await useSetting('core.notifications.sending-label') as string
  const base = host.replace(/^www\./, '')
  let unavailable: Unavailable | null = null
  if (base.endsWith('.workers.dev')) unavailable = 'workers-dev'
  else if (!base.includes('.') || /^[\d.]+$/.test(base) || base.endsWith('.localhost')) unavailable = 'local'
  else if (!(await cloudflareToken())) unavailable = 'no-token'
  return { host, proposed: unavailable === 'workers-dev' || unavailable === 'local' ? null : `${label}.${base}`, unavailable }
}
