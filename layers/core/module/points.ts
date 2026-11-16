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
      ability: ability.optional(),
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
  // A section of My account (or of a member's own pages, or of a person's page in the console). The
  // component is a name the app resolves; `count` with the section's own hiding is the same as an entry's.
  'core.account-section': point({
    kind: 'data',
    schema: z.object({
      id: z.string(),
      target: z.enum(['account', 'console-person']),
      side: z.enum(['audience', 'members']),
      ability,
      component: z.string(),
      order: z.number().int(),
      to: z.string().startsWith('/').optional(),
      icon: z.string().optional(),
      count: z.string().optional(),
      hideEmpty: z.boolean().optional(),
    }).strict().refine(e => !e.hideEmpty || e.count !== undefined, { message: 'hideEmpty needs a count', path: ['hideEmpty'] }),
  }),
  // A registered count, shown beside a menu entry or on a card. A module registers its own; another
  // module's is named by it. The contribution says how to count for the person asking.
  'core.count': point({ kind: 'code', contract: 'count' }),
  'core.setup-step': point({
    kind: 'data',
    schema: z.object({ id: z.string(), required: z.boolean(), to: z.string().startsWith('/'), order: z.number().int().optional() }).strict(),
  }),
  'core.health-check': point({ kind: 'code', contract: 'health-check' }),
  /** A source of verdicts on stored conditions, under its module's id (Formats tab, Requirements). */
  'core.requirement': point({ kind: 'code', contract: 'requirement-source' }),
  'core.erasure-handler': point({ kind: 'code', contract: 'erasure-handler' }),
  'core.record-resolver': point({ kind: 'code', contract: 'record-resolver' }),
  'core.privacy-record': point({
    kind: 'data',
    schema: z.object({ id: z.string(), holds: z.string(), why: z.string(), keptFor: z.string() }).strict(),
  }),
}
