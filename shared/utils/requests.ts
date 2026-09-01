import { z } from 'zod'
import { bookingForm } from './bookings'

// A booking outside policy, offered as a request rather than refused (C-108). The two ages are
// what stop one sitting forever, which is what the old app did with every request nobody saw.

export const REQUEST_REASON_LIMIT = 1000

export const requestForm = bookingForm.extend({
  // Somebody has to decide on this, and "please" is not a decision they can make.
  reason: z.string().trim().min(1, 'Say why this one is worth an exception').max(REQUEST_REASON_LIMIT),
})

export type RequestInput = z.output<typeof requestForm>

export function dueToEscalate(request: { createdAt: number, escalatedAt: number | null }, now: number, hours: number): boolean {
  if (request.escalatedAt !== null) return false
  return now - request.createdAt >= hours * 3600
}

export function dueToExpire(request: { createdAt: number }, now: number, hours: number): boolean {
  return now - request.createdAt >= hours * 3600
}
