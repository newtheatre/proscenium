import { refusalToAct } from '#shared/utils/external-requests'
import { z } from 'zod'

const query = z.object({
  when: z.enum(['upcoming', 'past']).default('upcoming'),
})

// The rooms not listed here that this member has asked for.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const input = await getValidatedQueryOrThrow(event, query)

  const found = await externalRequestsFor(account.id, input.when, Math.floor(Date.now() / 1000))
  const items = found.slice(0, LIST_CAP)

  return {
    when: input.when,
    items: items.map(one => ({ ...one, cancellable: refusalToAct(one, 'cancel') === null })),
    total: items.length,
    more: found.length > LIST_CAP,
  }
})
