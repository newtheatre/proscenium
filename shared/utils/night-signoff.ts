import { z } from 'zod'

// Sign-off and addendum request shapes (E-124). Nothing here reads a request or the database;
// `server/utils/night-signoff.ts` is where a report is actually frozen and corrected.

const CLOSING_NOTE_LIMIT = 2000
const ADDENDUM_NOTE_LIMIT = 2000

export const signOffForm = z.object({
  performanceId: z.string().min(1).optional(),
  closingNote: z.string().trim().min(1).max(CLOSING_NOTE_LIMIT),
})
export type SignOffFormInput = z.output<typeof signOffForm>

export const addendumForm = z.object({
  performanceId: z.string().min(1),
  note: z.string().trim().min(1).max(ADDENDUM_NOTE_LIMIT),
})
export type AddendumFormInput = z.output<typeof addendumForm>
