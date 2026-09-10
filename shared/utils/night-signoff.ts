import { z } from 'zod'

// Sign-off and addendum request shapes (E-124). Nothing here reads a request or the database;
// `server/utils/night-signoff.ts` is where a report is actually frozen and corrected.

const CLOSING_NOTE_LIMIT = 2000
const ADDENDUM_NOTE_LIMIT = 2000

// Named against training's own `signOffForm` (`shared/utils/training.ts`), an unrelated form
// Nuxt's auto-import would otherwise collide with silently.
export const nightSignOffForm = z.object({
  performanceId: z.string().min(1).optional(),
  closingNote: z.string().trim().min(1).max(CLOSING_NOTE_LIMIT),
})
export type NightSignOffFormInput = z.output<typeof nightSignOffForm>

export const nightAddendumForm = z.object({
  performanceId: z.string().min(1),
  note: z.string().trim().min(1).max(ADDENDUM_NOTE_LIMIT),
})
export type NightAddendumFormInput = z.output<typeof nightAddendumForm>
