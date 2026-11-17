// Renewal (tab 4, "Renewal"; R1 to R8): when a membership may be renewed, and the reminders.
import { addDays } from './dates'

export interface RenewalWindow { opensOn: string, closesOn: string }

/**
 * R1: from ends_on less the scheme's renewal_opens_days until the end of its grace. Null for an
 * indefinite membership (R7) and for a scheme that does not offer renewal (renewal_opens_days 0).
 */
export function renewalWindow(endsOn: string | null, scheme: { renewalOpensDays: number, graceDays: number }): RenewalWindow | null {
  if (!endsOn || scheme.renewalOpensDays <= 0) return null
  return { opensOn: addDays(endsOn, -scheme.renewalOpensDays), closesOn: addDays(endsOn, scheme.graceDays) }
}

/** R2: inside the window the renewal follows on the day after; after the end it starts today. */
export const renewalStarts = (endsOn: string, day: string): string => day <= endsOn ? addDays(endsOn, 1) : day
