import { z } from 'zod'

// The venue emergency card's vocabulary (E-113). Nothing here reads a request or the database;
// `server/utils/venue-emergency.ts` is where a version is actually written and read.

const FIELD_LIMIT = 1000
const NOTES_LIMIT = 2000

const field = () => z.string().trim().max(FIELD_LIMIT).nullish().transform(value => value?.trim() || null)

// The one line a volunteer reads aloud to a 999 handler, so a card without it is not a card
// (issue 902). Everything else on the form stays optional.
export const emergencyCardForm = z.object({
  address: z.string().trim().min(1, 'the address is what gets read to a 999 handler').max(FIELD_LIMIT),
  assemblyPoint: field(),
  exits: field(),
  isolationPoints: field(),
  firstAidKit: field(),
  defibrillator: field(),
  firstAiders: field(),
  firePanel: field(),
  what3words: z.string().trim().max(100).nullish().transform(value => value?.trim() || null),
  notes: z.string().trim().max(NOTES_LIMIT).nullish().transform(value => value?.trim() || null),
})

export type EmergencyCardInput = z.output<typeof emergencyCardForm>

export interface EmergencyCardCompleteness {
  address: string | null
  assemblyPoint: string | null
}

// What "filed" means on the committee's overview: a card nobody can read an address off is a
// blank page in the one moment it matters (E-113 criterion 1).
export function emergencyCardComplete(card: EmergencyCardCompleteness | null | undefined): boolean {
  return Boolean(card?.address && card.assemblyPoint)
}
