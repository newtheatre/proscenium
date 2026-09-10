// What a waiting-list link shows when opened: the entry's own state, and, while an offer stands,
// the ticket types it may be claimed against (D-113 criteria 2, 4).
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  const entryId = await verifyWaitingListToken(token)
  if (!entryId) throw createError({ statusCode: 404, statusMessage: 'No such waiting-list entry' })

  const entry = await waitingListEntryById(entryId)
  if (!entry) throw createError({ statusCode: 404, statusMessage: 'No such waiting-list entry' })

  const now = Math.floor(Date.now() / 1000)
  const offerOpen = entry.status === 'OFFERED' && entry.offerExpiresAt !== null && entry.offerExpiresAt > now
  const isMember = await hasCurrentMembership(event, entry.userId, new Date())

  return {
    status: entry.status,
    showId: entry.showId,
    showTitle: entry.showTitle,
    startsAt: entry.startsAt,
    partySize: entry.partySize,
    offerExpiresAt: entry.offerExpiresAt,
    ticketTypes: offerOpen ? await bookableTicketTypes(entry.performanceId, entry.showId, isMember, false) : [],
  }
})
