// The points the core offers (Foundations part 4).
import { z } from 'zod'
import { point } from '#kit'

const ability = z.union([z.string(), z.array(z.string()).min(1)])

export const points = {
  'core.navigation': point({
    kind: 'data',
    // A menu, not a shell: the account menu sits in the public shell. 'signed-in' as the ability
    // is for account entries every signed-in person sees.
    schema: z.object({
      id: z.string(),
      menu: z.enum(['account', 'members', 'console', 'live']),
      to: z.string().startsWith('/'),
      icon: z.string(),
      ability,
      order: z.number().int().optional(),
      group: z.string().optional(),
      section: z.enum(['everyday', 'setup']).optional(),
      count: z.string().optional(),
      hideEmpty: z.boolean().optional(),
      match: z.string().optional(),
    }).strict()
      .refine(e => e.ability !== 'signed-in' || e.menu === 'account', { message: "only an account entry may give ability 'signed-in'", path: ['ability'] })
      .refine(e => !e.hideEmpty || e.count !== undefined, { message: 'hideEmpty needs a count', path: ['hideEmpty'] }),
  }),
  'core.setup-step': point({
    kind: 'data',
    schema: z.object({ id: z.string(), required: z.boolean(), to: z.string().startsWith('/'), order: z.number().int().optional() }).strict(),
  }),
  'core.health-check': point({ kind: 'code', contract: 'health-check' }),
  'core.erasure-handler': point({ kind: 'code', contract: 'erasure-handler' }),
  'core.record-resolver': point({ kind: 'code', contract: 'record-resolver' }),
  'core.privacy-record': point({
    kind: 'data',
    schema: z.object({ id: z.string(), holds: z.string(), why: z.string(), keptFor: z.string() }).strict(),
  }),
}
