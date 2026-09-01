import { refusalToAct } from '#shared/utils/external-requests'
import { z } from 'zod'

const query = z.object({
  when: z.enum(['upcoming', 'past']).default('upcoming'),
})

// The union rooms this member has asked for.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const input = await getValidatedQueryOrThrow(event, query)

  const items = await externalRequestsFor(account.id, input.when, Math.floor(Date.now() / 1000))

  return {
    when: input.when,
    items: items.map(one => ({ ...one, cancellable: refusalToAct(one, 'cancel') === null })),
    total: items.length,
  }
})
