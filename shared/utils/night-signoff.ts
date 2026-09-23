import { z } from 'zod'

// Sign-off and addendum request shapes (E-124). Nothing here reads a request or the database;
// `server/utils/night-signoff.ts` is where a report is actually frozen and corrected.

const CLOSING_NOTE_LIMIT = 2000
const ADDENDUM_NOTE_LIMIT = 2000

// Named against training's own `signOffForm` (`shared/utils/training.ts`), an unrelated form
// Nuxt's auto-import would otherwise collide with silently.
export const nightSignOffForm = z.object({
  performanceId: z.string().min(1, 'Say which performance you mean').optional(),
  closingNote: z.string().trim().min(1, 'Say how the night went').max(CLOSING_NOTE_LIMIT),
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
