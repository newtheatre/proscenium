import { z } from 'zod'
import { inlineAgeCheckForm } from './age-checks'
import { basketLineForm } from './sale'

// Comps by request and approval, before the sale (F-110). Deciding one is restricted to tonight's
// duty manager or the bar manager, and never the requester (criterion 1).

export const COMP_REASON_LIMIT = 200
export const COMP_DECLINE_REASON_LIMIT = 200

export const compRequestForm = z.object({
  venueId: z.string().trim().min(1).optional(),
  performanceId: z.string().trim().min(1).optional(),
  lines: z.array(basketLineForm).min(1, 'A comp needs at least one line'),
  reason: z.string().trim().min(1, 'Say why, because a comp needs a reason on the record').max(COMP_REASON_LIMIT),
})

export type CompRequestInput = z.output<typeof compRequestForm>

export const declineCompRequestForm = z.object({
  reason: z.string().trim().min(1, 'Say why, because a decline needs a reason on the record').max(COMP_DECLINE_REASON_LIMIT),
})

export type DeclineCompRequestInput = z.output<typeof declineCompRequestForm>

// What spending an approved request submits: the screen's own belief of what it is giving away
// (0004, F-104's cross-check reused for a comp), and an inline Challenge 25 outcome if it needs one.
export const commitCompSaleForm = z.object({
  expectedForegonePence: z.number().int().nonnegative(),
  ageCheck: inlineAgeCheckForm.nullish().transform(value => value ?? null),
})

export type CommitCompSaleInput = z.output<typeof commitCompSaleForm>

export const COMP_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'DECLINED'] as const
export type CompRequestStatus = (typeof COMP_REQUEST_STATUSES)[number]

// What the till and the approver's queue both read: the basket asked for, priced live rather than
// cached, so a price change between the ask and the decision is never hidden (0004).
export interface CompRequest {
  id: string
  venueId: string
  night: string
  requestedBy: string
  requestedByName: string
  reason: string
  status: CompRequestStatus
  decidedBy: string | null
  decidedByName: string | null
  decidedAt: number | null
  declineReason: string | null
  entryId: string | null
  createdAt: number
  // Derived at read time from `createdAt` and the configured window, never stored (criterion 3).
  expired: boolean
}

// Whether the window has lapsed, the one clock both approval and the eventual sale are checked
// against, so an approval cannot outlive the request it approved (criterion 3).
export function compRequestExpired(createdAt: number, expiryMinutes: number, now: Date): boolean {
  return now.getTime() / 1000 - createdAt > expiryMinutes * 60
}
