// What staff give for a verification list.
import { z } from 'zod'

export const listInput = z.object({
  name: z.string().trim().min(1).max(80), // not-policy: the specification's bound
  keyKind: z.enum(['email', 'reference']),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(), // not-policy: the shape of a date
  referenceLabel: z.string().trim().min(10).max(120).nullish(), // not-policy: a whole phrase, never a bare noun (V13)
  // The short noun messages use ("student ID"), so they never splice the whole question in.
  referenceNoun: z.string().trim().min(2).max(40).nullish(), // not-policy: a few words
  referenceShape: z.object({
    kind: z.enum(['digits', 'letters-and-digits']),
    min: z.number().int().min(1).max(40), // not-policy: the bound of a reference's length
    max: z.number().int().min(1).max(40), // not-policy: the bound of a reference's length
  }).refine(s => s.min <= s.max).nullish(),
})
