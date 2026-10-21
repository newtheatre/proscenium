import { db } from '@nuxthub/db'
import { remainingSeats, saleRefusal } from '#shared/utils/programme'
import { waitingListJoinRefusal } from '#shared/utils/waiting-list'
import type { H3Event } from 'h3'

// What a waiting-list link shows when opened: the entry's own state, and, while an offer stands,
// the ticket types it may be claimed against (D-113 criteria 2, 4).
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  const entryId = await verifyWaitingListToken(token)
  if (!entryId) throw noSuch('waiting-list entry', 'Ask us for a new link if you still want the seats')

  const entry = await waitingListEntryById(entryId)
  if (!entry) throw noSuch('waiting-list entry', 'Ask us for a new link if you still want the seats')

  const now = Math.floor(Date.now() / 1000)
  const offerOpen = entry.status === 'OFFERED' && entry.offerExpiresAt !== null && entry.offerExpiresAt > now
  const isMember = await hasCurrentMembership(event, entry.userId, new Date())

  return {
    status: entry.status,
    performanceId: entry.performanceId,
    showId: entry.showId,
    showTitle: entry.showTitle,
    startsAt: entry.startsAt,
    partySize: entry.partySize,
    offerExpiresAt: entry.offerExpiresAt,
    ticketTypes: offerOpen ? await bookableTicketTypes(entry.performanceId, entry.showId, isMember, false) : [],
    bookable: offerOpen ? false : await bookableForParty(event, entry.performanceId, entry.partySize),
  }
})

// Seats on sale for the whole party mean a person still waiting can simply book (0120).
async function bookableForParty(event: H3Event, performanceId: string, partySize: number): Promise<boolean> {
  const performance = await performanceById(performanceId)
  if (!performance || saleRefusal(performance, new Date(), 'CUSTOMER', await holdReleaseMinutesFor(event, performance))) return false
  const [house] = await db.all<{ held: number }>(heldSeatsQuery(performanceId))
  return waitingListJoinRefusal(remainingSeats({ capacity: effectiveCapacity(performance), sold: Number(house?.held ?? 0) }), partySize) !== null
}
