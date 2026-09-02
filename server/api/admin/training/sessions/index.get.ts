import { z } from 'zod'
import { SESSION_STATUSES } from '#shared/utils/training'

const query = z.object({
  status: z.enum(SESSION_STATUSES).optional(),
  mine: yesOrNo.default(false),
})

// The sessions an officer or a trainer can see, soonest first.
export default defineEventHandler(async (event) => {
  const resolved = await requireTrainer(event)
  const input = await getValidatedQueryOrThrow(event, query)

  const items = await listSessions({
    status: input.status,
    trainerId: input.mine ? resolved.account.id : undefined,
  })
  return { items, total: items.length }
})
