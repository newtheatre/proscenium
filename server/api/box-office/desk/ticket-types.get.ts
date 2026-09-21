import { z } from 'zod'
import { saleRefusal } from '#shared/utils/programme'
import type { WalkUpOption } from '#shared/utils/sale'

const query = z.object({ performanceId: z.string().trim().min(1, 'Say which performance you mean') })

// What the desk may sell a walk-up as (D-115 criterion 7): the performance's own bookable types
// at the desk's prices, less the access kinds, which need a verified booker (D-128).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const { performanceId } = await getValidatedQueryOrThrow(event, query)

  const performance = await performanceById(performanceId)
  if (!performance) throw noSuch('performance')
  const refusal = saleRefusal(performance, new Date(), 'DESK')
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal.says })

  const options: WalkUpOption[] = (await bookableTicketTypes(performanceId, performance.showId, false, false))
    .filter(type => type.accessKind === null)
    .map(type => ({ id: type.id, name: type.name, price: type.price }))

  return { performanceId, options }
})
