// Applies a rota template to several days at once, as one batch of draft shifts (FH-48).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { makeBatch } from '../../../grid'

const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) // not-policy: a 24-hour time's shape

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    templateId: z.string().min(1).max(40), // not-policy: shape bound
    venueId: z.string().min(1).max(40), // not-policy: shape bound
    spaceId: z.string().min(1).max(40).nullish(), // not-policy: shape bound
    title: z.string().trim().min(1).max(80), // not-policy: shape bound, as the table's CHECK
    days: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(31), // not-policy: the table's bound on a batch's days
    callTime: TIME,
    endTime: TIME,
    crewCallId: z.string().min(1).max(40).nullish(), // not-policy: shape bound
    signUp: z.boolean().optional(),
  }).strict(),
}, async (_event, { input, actor, unit }) => makeBatch(unit.view(), input, actor.accountId!))
