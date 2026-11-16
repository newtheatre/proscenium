// Records a closure for the whole theatre, a venue or one space (C-18).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { createClosure } from '../../../places/closures'

const DATE = /^\d{4}-\d{2}-\d{2}$/ // not-policy: a date's shape
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/ // not-policy: a local date and time's shape

export default defineRoute({
  ability: 'core.closure.manage',
  rateLimit: 'write',
  input: z.object({
    venueId: z.string().nullable().optional(),
    spaceId: z.string().nullable().optional(),
    title: z.string().trim().min(1).max(120), // not-policy: a closure title's bounds
    allDay: z.boolean(),
    from: z.string(),
    to: z.string(),
    blocksPerformances: z.boolean().optional(),
  }).refine(v => (v.allDay ? DATE : LOCAL).test(v.from) && (v.allDay ? DATE : LOCAL).test(v.to), { message: 'Give dates for a whole-day closure, or dates and times otherwise.', path: ['from'] }),
}, async (_event, { input, unit, actor }) => {
  return { id: await createClosure(unit, input, actor.accountId ?? null) }
})
