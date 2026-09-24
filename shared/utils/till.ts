import { saysMoney } from './bar'
import { z } from 'zod'

// The till's own session (F-102): the one accountable window that every sale, tab charge and comp
// hangs off. One per venue per night, opened once and closed once.

export interface TillSession {
  id: string
  venueId: string
  night: string
  openedBy: string
  openedAt: number
  closedBy: string | null
  closedAt: number | null
  // Written once, with the close itself; null until then (F-118 criterion 3).
  expectedTotalPence: number | null
  actualZPence: number | null
  variancePence: number | null
  varianceNote: string | null
}

// Where to open one. Never a night: the till only ever acts on tonight's (F-101 criterion 1), and
// a stale session is addressed by its own id, not asked for by scope.
export const tillScopeForm = z.object({
  venueId: z.string().trim().min(1, 'Say which venue you mean').optional(),
  performanceId: z.string().trim().min(1, 'Say which performance you mean').optional(),
})

export type TillScopeInput = z.output<typeof tillScopeForm>

// One row of the picker the till shows when the scope names no venue: what the evening is there,
// so a volunteer chooses by show or by the opening's label rather than by a database id (F-125).
export interface TillVenueOption {
  venueId: string
  venueName: string
  what: string
}

// Closing a session takes the reader's own reading and needs a live expected figure to compare
// it against, so its form lives with that computation in `shared/utils/reconciliation.ts` (F-118).

// What a charge button reads. Show-night register: four words at most, verb first, so a total
// read at arm's length mid-service is the whole label (K-128, copy-style §3).
export function saysChargeOnReader(totalPence: number | null, onTab: boolean): string {
  if (onTab) return 'Charge the tab'
  return totalPence === null ? 'Charge the basket' : `Charge ${saysMoney(totalPence)}`
}

export function saysChargeOnSumUp(totalPence: number | null): string {
  return totalPence === null ? 'Charge on SumUp' : `Charge ${saysMoney(totalPence)} on SumUp`
}

// The bar this device opened tonight, so a bare link to the till (the SumUp app's return in a
// fresh tab, issue 1257) opens there rather than asking again. Kept for its show night only (0014).
export const TILL_VENUE_DEVICE_KEY = 'nnt-till-venue'

interface DeviceStore {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function rememberTillVenue(store: Pick<DeviceStore, 'setItem'>, night: string, venueId: string): void {
  try {
    store.setItem(TILL_VENUE_DEVICE_KEY, JSON.stringify({ night, venueId }))
  }
  catch { /* a device that keeps nothing asks which bar again */ }
}

export function recallTillVenue(store: Pick<DeviceStore, 'getItem'>, night: string): string | null {
  try {
    const held = JSON.parse(store.getItem(TILL_VENUE_DEVICE_KEY) ?? 'null') as { night?: unknown, venueId?: unknown } | null
    return held?.night === night && typeof held.venueId === 'string' ? held.venueId : null
  }
  catch {
    return null
  }
}
