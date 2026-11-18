// "Get your theatre ready" on Admin's overview: the first things a new theatre does after setup, each
// done or not, with where it is done. The list is fixed; an item is done when what it asks for is
// there, so it stays done however it was done. Email has its own warning card as well, because
// until a domain is verified nothing is sent at all.
import { all, first, nowMs, useSetting } from '#kit'
import { enabledModules } from '#kit/modules-store'
import { useRegistry } from '#kit/registry'
import { LIVE } from '../identity/grants'

export const READY_ITEMS = ['name', 'time-zone', 'email', 'branding', 'venue', 'modules', 'staff'] as const
export type ReadyItem = typeof READY_ITEMS[number]

const WHERE: Record<ReadyItem, string> = {
  'name': '/admin/theatre?setting=core.site.name',
  'time-zone': '/admin/theatre?setting=core.locale.time-zone',
  'email': '/admin/email',
  'branding': '/admin/branding',
  'venue': '/admin/modules/core/venues',
  'modules': '/admin/modules',
  'staff': '/console/people/grants',
}

/** Whether email can be sent: a sending domain has passed its test message. */
export async function emailVerified(): Promise<boolean> {
  return !!await useSetting('core.notifications.verified-domain')
}

async function done(item: ReadyItem): Promise<boolean> {
  switch (item) {
    case 'name': return !!await useSetting('core.site.name')
    case 'time-zone': return !!await useSetting('core.locale.time-zone')
    case 'email': return emailVerified()
    case 'branding': return !!await useSetting('core.brand.logo')
    case 'venue': return !!await first('SELECT 1 AS one FROM core_venues WHERE state = \'active\' LIMIT 1')
    case 'modules': {
      const registry = useRegistry()
      return [...await enabledModules()].some(id => id !== 'core' && registry.modules.get(id)?.manifest.switchable !== false)
    }
    case 'staff': {
      // Someone besides the Owner who set the site up holds a role.
      const at = nowMs()
      const holders = await all<{ account_id: string }>(`SELECT DISTINCT g.account_id FROM core_grants g WHERE ${LIVE} LIMIT 2`, at, at)
      return holders.length > 1
    }
  }
}

export async function gettingReady(): Promise<{ id: ReadyItem, done: boolean, to: string }[]> {
  const out: { id: ReadyItem, done: boolean, to: string }[] = []
  for (const id of READY_ITEMS) out.push({ id, done: await done(id), to: WHERE[id] })
  return out
}
