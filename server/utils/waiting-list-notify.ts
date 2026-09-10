import { sendWaitingListOffered } from './waiting-list-confirmation'
import { waitingListTokenFor } from './waiting-list-tokens'
import type { OfferedWaitingListEntry } from './waiting-list'
import type { H3Event } from 'h3'

// Kept apart from server/utils/waiting-list.ts, which `tests/` imports directly under Bun: minting
// a token and sending a message both need a live Nitro runtime, the same split `qrTokenFor` and
// `writeReservation` keep (D-104). Called after `offerWaitingList` commits, never before (0003).
export async function notifyWaitingListOffers(event: H3Event | undefined, offered: OfferedWaitingListEntry[]): Promise<void> {
  for (const entry of offered) {
    const token = await waitingListTokenFor(entry.id)
    await sendWaitingListOffered(event, {
      userId: entry.userId,
      showTitle: entry.showTitle,
      startsAt: entry.startsAt,
      expiresAt: entry.expiresAt,
      token,
    })
  }
}
