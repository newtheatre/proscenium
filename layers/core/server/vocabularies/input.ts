// The shape a new vocabulary takes, shared so the form and the route agree on every bound.
import { z } from 'zod'

export const vocabularyInput = z.object({
  label: z.string().trim().min(1).max(80), // not-policy: the label's bounds
  description: z.string().trim().max(300).nullable().optional(), // not-policy: the description's bound
  ordering: z.enum(['manual', 'alphabetical']).optional(),
})
