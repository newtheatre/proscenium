// Joining a scheme (MEM-11, MEM-12, MEM-16): the work is joinScheme's, shared with a request for a
// manual check made while booking a member ticket.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { joinScheme } from '../../../../join'
import { requireScheme } from '../../../../schemes'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    lengthOptionId: z.string().nullish(),
    // The reference a list scheme checks, such as a student ID. Hashed, never stored (V10).
    reference: z.string().trim().max(254).nullish(), // not-policy: an address's bound
    // A reference the list does not hold waits for staff to check it, rather than being refused.
    askStaff: z.boolean().optional(),
    // The answers to the scheme's application form, when it has one (MEM-12).
    form: z.object({ formId: z.string(), answers: z.record(z.string(), z.unknown()) }).nullish(),
  }),
}, async (event, { input, actor, unit }) => joinScheme(unit, actor, await requireScheme(getRouterParam(event, 'id', { decode: true })), input))
