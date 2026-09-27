import { z } from 'zod'
import { plural } from './text'
import { saysClock } from './when'
import type { Phase, SystemCheck } from './checklist'

// Sign-off and addendum request shapes (E-124). Nothing here reads a request or the database;
// `server/utils/night-signoff.ts` is where a report is actually frozen and corrected.

const CLOSING_NOTE_LIMIT = 2000
const ADDENDUM_NOTE_LIMIT = 2000

// Named against training's own `signOffForm` (`shared/utils/training.ts`), an unrelated form
// Nuxt's auto-import would otherwise collide with silently.
export const nightSignOffForm = z.object({
  performanceId: z.string().min(1, 'Say which performance you mean').optional(),
  closingNote: z.string().trim().min(1, 'Say how the night went').max(CLOSING_NOTE_LIMIT),
  // How many incidents the report on screen listed: the sign-off reviews those and no others.
  incidentsSeen: z.number().int().min(0),
})
export type NightSignOffFormInput = z.output<typeof nightSignOffForm>

export const nightAddendumForm = z.object({
  performanceId: z.string().min(1, 'Say which performance you mean'),
  note: z.string().trim().min(1, 'Say what the addendum adds').max(ADDENDUM_NOTE_LIMIT),
})
export type NightAddendumFormInput = z.output<typeof nightAddendumForm>

// The screen's words for who closed a night; an officer standing in is named as such (0044).
export type NightReportSigner = 'SHIFT' | 'OFFICER' | 'SYSTEM'

export function saysSignedOff(signedByName: string | null, signedVia: NightReportSigner): string {
  if (signedVia === 'SYSTEM') return 'Closed automatically, with nobody signing.'
  const who = signedByName ?? 'a former member'
  return signedVia === 'OFFICER'
    ? `Signed off by ${who}, standing in with no duty manager shift.`
    : `Signed off by ${who}.`
}

export const OFFICER_SIGN_OFF_NOTICE = 'You hold no duty manager shift tonight. Your sign-off is recorded as standing in for the duty manager.'

export function tenderTotalPence(tenders: readonly { totalPence: number }[]): number {
  return tenders.reduce((sum, tender) => sum + tender.totalPence, 0)
}

// Sign off and close answers this item itself, reviewing the incidents the report listed in the
// same batch as the close (issue 1315, E-114 criterion 3).
export const REVIEWED_AT_SIGN_OFF: SystemCheck = 'INCIDENTS_REVIEWED'

interface ChecklistState { phase: Phase, required: boolean, done: boolean, systemCheck: SystemCheck | null }

// What still holds Sign off and close, in either phase (E-114 criterion 4).
export function holdsTheClose(entry: ChecklistState): boolean {
  return entry.required && !entry.done && entry.systemCheck !== REVIEWED_AT_SIGN_OFF
}

// What the report lists with a Tick in place after the curtain: every post-show item still open,
// and any required pre-show one still holding the close.
export function openAtClose<T extends ChecklistState>(entries: readonly T[]): T[] {
  return entries.filter(entry => !entry.done && entry.systemCheck !== REVIEWED_AT_SIGN_OFF
    && (entry.phase === 'POST' || entry.required))
}

// Incidents are append-only, so the log only grows; any other mismatch is a client out of step.
export function saysIncidentsMoved(shown: number, logged: number): string {
  if (logged > shown) return `${plural(logged - shown, 'incident')} logged since you opened the report: read it again and sign off`
  return 'The report has changed since you opened it: read it again and sign off'
}

export function saysSignOffOpens(curtainDownAt: number): string {
  return `Sign off and close opens at ${saysClock(curtainDownAt)}, once the curtain is down`
}

// The route's refusal before the curtain, the moment the screen stops hiding the button; a
// performance with no times to reckon from is not held, as the screen does not hold it.
export function signOffTooEarly(curtainDownAt: number | null, at: number): string | null {
  return curtainDownAt !== null && at < curtainDownAt ? saysSignOffOpens(curtainDownAt) : null
}
