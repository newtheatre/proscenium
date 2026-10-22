import { HOLDS_A_SLOT, describePurpose } from './bookings'
import { OPEN_STATUSES } from './external-requests'
import { othersHeld } from './requests'
import { plural } from './text'

// One queue over two tables (C-122). Not a SQL union: the column sets differ enough that one
// would misrepresent the shape, so each side is read as itself and merged by these.

export type RequestKind = 'room' | 'unlisted'

export interface QueueItem {
  id: string
  kind: RequestKind
  userId: string
  requester: string
  title: string
  purpose: string | null
  attendees: number | null
  startsAt: number
  endsAt: number
  status: string
  where: string | null
  createdAt: number
  decidedAt: number | null
  // Only a room of ours is judged against a policy; only a room we do not manage has a form.
  roomId?: string
  tier?: string
  failures?: { reason: string, says: string }[]
  sensitive?: boolean
  // The requester's no-shows when they are why it is here, null when they are not (C-116).
  preApprovalNoShows?: number | null
  reason?: string | null
  rejectionReason?: string | null
  preferredSpaceId?: string | null
  assignedSpaceId?: string | null
  preferredWarning?: string | null
  suReference?: string | null
  formDueBy?: string | null
  convertedToRequestId?: string | null
  convertedToBookingId?: string | null
  offers?: { id: string, spaceId: string, space: string, outcome: string, reason: string | null, by: string | null, recordedAt: number }[]
}

// Open means somebody still owes an answer. A confirmed request is answered even though its room
// can still be corrected, or every confirmed one would sit at the top of the work list for ever.
export function isOpenRequest(item: { kind: RequestKind, status: string }): boolean {
  return item.kind === 'room'
    ? item.status === 'PENDING_APPROVAL'
    : (OPEN_STATUSES as readonly string[]).includes(item.status)
}

// Open work first and soonest first, then settled most recently settled first. A queue is a list
// of work, and an answered request from last term is a lookup rather than the top of it.
export function inQueueOrder(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => {
    const open = isOpenRequest(a)
    if (open !== isOpenRequest(b)) return open ? -1 : 1
    if (open) return a.startsAt - b.startsAt
    return (b.decidedAt ?? b.createdAt) - (a.decidedAt ?? a.createdAt)
  })
}

// The purpose once when the request was left unnamed, which is when its title is the purpose's
// own words: "Meeting (Meeting)" says nothing twice.
export function saysRequestName(item: { title: string, purpose: string | null }): string {
  const purpose = describePurpose(item.purpose)
  const title = item.title.trim()
  if (!title || title.toLowerCase() === purpose.toLowerCase()) return purpose
  return `${title} (${purpose})`
}

// A waiting request holds its slot and so counts towards the cap (0208), but never against
// itself: judged with itself counted, every request over the cap would read as breaking it.
export function heldBesides(held: number, item: { status: string, endsAt: number }, now: number): number {
  return (HOLDS_A_SLOT as readonly string[]).includes(item.status) ? othersHeld(held, item, now) : held
}

export function saysPreApproval(noShows: number): string {
  return `Under pre-approval (${plural(noShows, 'no-show')})`
}

// What a batch approval asks first: how many of the chosen fall on a day the room is shut or
// outside its hours. Null when none do, so nothing is asked.
export function saysOutsideOpening(items: { where: string | null, failures?: { reason: string }[] }[]): string | null {
  const closed = items.filter(item => item.failures?.some(fail => fail.reason === 'ROOM_CLOSED')).length
  const outside = items.filter(item => item.failures?.some(fail => fail.reason === 'OUT_OF_HOURS')).length
  if (closed === 0 && outside === 0) return null

  const rooms = new Set(items.filter(item => item.failures?.some(fail => fail.reason === 'ROOM_CLOSED' || fail.reason === 'OUT_OF_HOURS')).map(item => item.where))
  const room = rooms.size === 1 ? ([...rooms][0] ?? 'the room') : 'their room'
  const parts = [
    closed ? `${closed} of these ${closed === 1 ? 'is on a day' : 'are on days'} ${room} is closed` : null,
    outside ? `${outside} of these ${outside === 1 ? 'is' : 'are'} outside the hours ${room} opens` : null,
  ].filter(Boolean)
  return parts.join(', and ')
}
