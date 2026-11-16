// Inputs more than one route accepts: a grant's scope and a role.
import { z } from 'zod'

const name = z.string().regex(/^[a-z][a-z0-9-]*$/).max(64) // not-policy: a module id is short
export const scopeInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('site') }),
  z.object({ kind: z.literal('module'), module: name }),
  z.object({ kind: z.literal('record'), module: name, type: z.string().max(128), id: z.string().max(64) }), // not-policy: a record type and id are short
])

export const roleInput = z.object({
  name: z.string().trim().min(1).max(80), // not-policy: a role's name is a few words
  description: z.string().trim().max(500).nullable().optional(), // not-policy: a sentence or two
  abilities: z.array(z.string().max(120)).max(500), // not-policy: bounds on a list of ability names
  expiryRule: z.enum(['year_end', 'days', 'none']),
  expiryDays: z.number().int().min(1).max(3650).nullable().optional(), // not-policy: up to ten years
  opensMembersArea: z.boolean(),
}).strict()
