// The emergency contacts a member keeps (ID-17): the route's input, shared with My account's form
// so both say the same about the same value.
import { z } from 'zod'

export const MAX_EMERGENCY_CONTACTS = 3 // not-policy: the spec fixes up to three (ID-17)

export const emergencyContact = z.object({
  name: z.string().trim().min(1).max(120), // not-policy: a person's name
  relationship: z.string().trim().max(40).nullable().optional().transform(v => v || null), // not-policy: the column's own length check
  phone: z.string().trim().min(3).max(40).regex(/^[0-9+()\-. ]+$/), // not-policy: a phone number in any common form
}).strict()

export const emergencyContactsInput = z.object({ contacts: z.array(emergencyContact).max(MAX_EMERGENCY_CONTACTS), told: z.literal(true) }).strict()
