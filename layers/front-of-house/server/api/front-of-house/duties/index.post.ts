// Adds a duty: a kind of job on a night (FH-05, the part the gate needs).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { createDuty } from '../../../shifts'

export default defineRoute({
  ability: 'front-of-house.duty.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    name: z.string().trim().min(1).max(60), // not-policy: shape bound, as the table's CHECK
    description: z.string().trim().max(500).nullish(), // not-policy: shape bound
    isLead: z.boolean().optional(),
    callBeforeMinutes: z.number().int().min(0).max(480), // not-policy: shape bound, as the table's CHECK
    stayAfterMinutes: z.number().int().min(0).max(480), // not-policy: shape bound, as the table's CHECK
    requirements: z.array(z.string().min(3).max(200)).max(10).optional(), // not-policy: shape bound
    sortOrder: z.number().int().min(0).max(1000).optional(), // not-policy: shape bound
  }).strict(),
}, (_event, { input, unit }) => ({ dutyId: createDuty(unit.view(), input) }))
