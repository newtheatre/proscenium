// The points the core offers (Foundations part 4).
import { z } from 'zod'
import { point } from '#kit'

const ability = z.union([z.string(), z.array(z.string()).min(1)])

export const points = {
  'core.navigation': point({
    kind: 'data',
    schema: z.object({
      id: z.string(),
      menu: z.enum(['account', 'members', 'console', 'live']),
      to: z.string().startsWith('/'),
      icon: z.string(),
      ability: ability.optional(),
      order: z.number().int().optional(),
      group: z.string().optional(),
      section: z.enum(['everyday', 'setup']).optional(),
      count: z.string().optional(),
      match: z.string().optional(),
    }).strict(),
  }),
  // A console group is declared once, by the module that owns it. A theatre's own module places its
  // group with `before` or `after`; the platform's own groups keep the fixed order.
  'core.navigation-group': point({
    kind: 'data',
    schema: z.object({
      id: z.string(),
      icon: z.string(),
      order: z.number().int().optional(),
      before: z.string().optional(),
      after: z.string().optional(),
    }).strict(),
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
