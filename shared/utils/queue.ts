import { OPEN_STATUSES } from './external-requests'

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
