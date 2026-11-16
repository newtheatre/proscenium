// Sends a security notice to each address it names. A retry sends nothing twice: each address's
// message carries the notice's own key.
import { defineJob } from '#kit'
import { openValue } from '../identity/crypto'
import type { Notice } from '../identity/notices'
import { notifyAddress } from '../notifications/send'

export default defineJob<{ sealed: string }>(async (payload, unit) => {
  const notice = await openValue<Notice>('account-notice', payload.sealed)
  if (!notice) throw new Error('The notice could not be opened: CORE_SESSION_KEY may have changed')
  for (const address of notice.addresses)
    await notifyAddress(unit, notice.type, { address, variables: notice.variables, dedupeKey: `${notice.key}:${address}` })
})
