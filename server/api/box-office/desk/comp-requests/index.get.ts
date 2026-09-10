import { z } from 'zod'

// The approver's queue: named to a performance, since a comp is a fact about one house, never a
// day or a venue (CLAUDE.md). Read access is a manager's own gate, the same as deciding one.
export default defineEventHandler(async (event) => {
  const { performanceId } = await getValidatedQueryOrThrow(event, z.object({ performanceId: z.string().trim().min(1) }))
  const account = await requireAccount(event)

  const performance = await performanceById(performanceId)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })
  const night = performanceNight(performance.startsAt)

  if (!await isDutyManagerOrTicketingManager(account.id, night)) {
    throw createError({ statusCode: 403, statusMessage: 'A duty manager or ticketing manager decides a comp request' })
  }

  const expiryMinutes = await configValue(event, 'COMP_REQUEST_EXPIRY_MINUTES')
  return { items: await pendingTicketCompRequests(performanceId, expiryMinutes) }
})
