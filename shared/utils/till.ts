import { saysMoney } from './bar'
import { plural } from './text'
import { z } from 'zod'
import type { NightCacheStore } from './night-cache'
import type { SumupAttemptView } from './sumup'

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

// What ended nights left open, each with its bar: no shift reaches back into a night, so the till
// lists these for the Bar Manager alone to close and answer (F-102 criterion 5, issue 1316).
export interface EarlierTillLeftOpen {
  sessions: (TillSession & { venueName: string })[]
  // `sessionOpen`: that night's till is still open at that bar, which recording the sale needs.
  attempts: (SumupAttemptView & { night: string, venueName: string, sessionOpen: boolean })[]
}

// The close-night checklist's reading of one venue's bar (E-114 criterion 3, issue 1316).
export interface TillLeftOpen {
  tonight: number
  earlier: number
  unanswered: number
}

// Null is the line ticked. Only the bar closes a till, so the line says who does, and it never
// holds the duty manager's close (F-102 criterion 5).
export function saysTillLeftOpen(left: TillLeftOpen): string | null {
  const said: string[] = []
  if (left.tonight > 0) said.push('Tonight\'s till is still open: whoever is on the bar closes it from the till.')
  const earlier = [
    left.earlier > 0 ? `${plural(left.earlier, 'till')} from an earlier night left open` : null,
    left.unanswered > 0 ? `${plural(left.unanswered, 'card charge')} from an earlier night left unanswered` : null,
  ].filter(part => part !== null)
  if (earlier.length > 0) said.push(`${earlier.join(', and ')}. Tell the Bar Manager, whose role alone reaches an earlier night from the till.`)
  return said.length > 0 ? said.join(' ') : null
}

// What a charge button reads. Show-night register: four words at most, verb first, so a total
// read at arm's length mid-service is the whole label (K-128, copy-style §3).
export function saysChargeOnReader(totalPence: number | null, onTab: boolean): string {
  if (onTab) return 'Charge the tab'
  return totalPence === null ? 'Charge the basket' : `Charge ${saysMoney(totalPence)}`
}

export function saysChargeOnSumUp(totalPence: number | null): string {
  return totalPence === null ? 'Charge on SumUp' : `Charge ${saysMoney(totalPence)} on SumUp`
}

export type ChargePath = 'sumup' | 'typed' | 'tab'

// One charge button under the thumb (0096, F-124 criterion 1): the hand-off where the phone has
// it, with keying the figure by hand as the fallback link; a tab never goes to the reader.
export function chargePaths(sumupAvailable: boolean, onTab: boolean): { primary: ChargePath, secondary: ChargePath | null } {
  if (onTab) return { primary: 'tab', secondary: null }
  return sumupAvailable ? { primary: 'sumup', secondary: 'typed' } : { primary: 'typed', secondary: null }
}

// The bar this device opened tonight, so a bare link to the till (the SumUp app's return in a
// fresh tab, issue 1257) opens there rather than asking again. Kept for its show night only (0014).
export const TILL_VENUE_DEVICE_KEY = 'nnt-till-venue'

export function rememberTillVenue(store: Pick<NightCacheStore, 'setItem'>, night: string, venueId: string): void {
  try {
    store.setItem(TILL_VENUE_DEVICE_KEY, JSON.stringify({ night, venueId }))
  }
  catch { /* a device that keeps nothing asks which bar again */ }
}

export function recallTillVenue(store: Pick<NightCacheStore, 'getItem'>, night: string): string | null {
  try {
    const held = JSON.parse(store.getItem(TILL_VENUE_DEVICE_KEY) ?? 'null') as { night?: unknown, venueId?: unknown } | null
    return held?.night === night && typeof held.venueId === 'string' ? held.venueId : null
  }
  catch {
    return null
  }
}

// Only the guard's own question (400, no bar named) is answered from the device; a night the
// server resolves unaided opens where it says, so a stale memory cannot pick the wrong bar.
export function rememberedBarAnswers(refusal: number | undefined, queried: string | undefined, remembered: string | undefined): boolean {
  return refusal === 400 && !queried && Boolean(remembered)
}
