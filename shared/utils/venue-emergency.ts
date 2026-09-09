import { z } from 'zod'

// The venue emergency card's vocabulary (E-113). Nothing here reads a request or the database;
// `server/utils/venue-emergency.ts` is where a version is actually written and read.

const FIELD_LIMIT = 1000
const NOTES_LIMIT = 2000

const field = () => z.string().trim().max(FIELD_LIMIT).nullish().transform(value => value?.trim() || null)

export const emergencyCardForm = z.object({
  assemblyPoint: field(),
  exits: field(),
  isolationPoints: field(),
  what3words: z.string().trim().max(100).nullish().transform(value => value?.trim() || null),
  notes: z.string().trim().max(NOTES_LIMIT).nullish().transform(value => value?.trim() || null),
})

export type EmergencyCardInput = z.output<typeof emergencyCardForm>
