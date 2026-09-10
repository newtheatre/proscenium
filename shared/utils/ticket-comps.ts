import { z } from 'zod'

// Ticket comps, requested and approved before anything is collected (D-117). The request names
// a reservation already held at the desk; the desk still takes the same tickets, at nought.

export const TICKET_COMP_REASON_LIMIT = 200
export const TICKET_COMP_DECLINE_REASON_LIMIT = 200

export const ticketCompRequestForm = z.strictObject({
  reservationId: z.string().trim().min(1),
  reason: z.string().trim().min(1, 'Say why, because a comp needs a reason on the record').max(TICKET_COMP_REASON_LIMIT),
})

export type TicketCompRequestInput = z.output<typeof ticketCompRequestForm>

export const declineTicketCompRequestForm = z.strictObject({
  reason: z.string().trim().min(1, 'Say why, because a decline needs a reason on the record').max(TICKET_COMP_DECLINE_REASON_LIMIT),
})

export type DeclineTicketCompRequestInput = z.output<typeof declineTicketCompRequestForm>

export const TICKET_COMP_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'DECLINED'] as const
export type TicketCompRequestStatus = (typeof TICKET_COMP_REQUEST_STATUSES)[number]

// What the desk and the approver's queue both read, hydrated with the requester's and decider's
// own names so neither has to be looked up separately.
export interface TicketCompRequest {
  id: string
  reservationId: string
  performanceId: string
  requestedBy: string
  requestedByName: string
  reason: string
  status: TicketCompRequestStatus
  decidedBy: string | null
  decidedByName: string | null
  decidedAt: number | null
  declineReason: string | null
  entryId: string | null
  createdAt: number
  // Derived at read time from `createdAt` and the configured window, never stored (criterion 2).
  expired: boolean
}

// Whether the window has lapsed, the one clock both approval and the eventual collection are
// checked against, so an approval cannot outlive the request it approved (criterion 2).
export function ticketCompRequestExpired(createdAt: number, expiryMinutes: number, now: Date): boolean {
  return now.getTime() / 1000 - createdAt > expiryMinutes * 60
}
