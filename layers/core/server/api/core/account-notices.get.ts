// What needs the person on My account's overview: every module's notices for the person asking, in
// the order the modules were registered. A source that fails leaves its notices out, never the page.
import { defineRoute, usePoint } from '#kit'
import type { AccountNotice, AccountNoticeSource } from '../../points/account-notice'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const notices: (AccountNotice & { key: string })[] = []
  for (const source of await usePoint<AccountNoticeSource>('core.account-notice')) {
    try {
      for (const n of await source.value.notices(actor)) notices.push({ ...n, key: `${source.id}:${n.id}` })
    }
    catch {
      // Tidiness, not a fault: the overview still opens.
    }
  }
  return { notices }
})
