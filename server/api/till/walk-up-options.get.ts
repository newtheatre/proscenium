import { z } from 'zod'
import { tillScopeForm } from '#shared/utils/till'
import { saleRefusal } from '#shared/utils/programme'
import type { WalkUpOption } from '#shared/utils/sale'

const query = tillScopeForm.extend({ performanceId: z.string().trim().min(1, 'Say which performance you mean') })

// What a walk-up may be sold as tonight (F-123 criterion 1): the performance's own bookable
// types at the desk's prices, less the access kinds, which need a verified booker (D-128).
export default defineEventHandler(async (event) => {
  const input = await getValidatedQueryOrThrow(event, query)
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })
  requireOpenSession(await openSessionFor(resolved.venueId, resolved.night))

  const performance = await performanceById(input.performanceId)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })
  const refusal = saleRefusal(performance, new Date(), 'DESK')
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal.says })

  const options: WalkUpOption[] = (await bookableTicketTypes(input.performanceId, performance.showId, false, false))
    .filter(type => type.accessKind === null)
    .map(type => ({ id: type.id, name: type.name, price: type.price }))

  return { performanceId: input.performanceId, showTitle: performance.showTitle, options }
})
