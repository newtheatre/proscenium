// Scan a code at the door (BO-40). The answer is always a result, never a refusal, so the screen
// can show it at once: admitted, already in, void, another performance, no longer qualifying for
// the ticket's type, not paid, or not ours.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { scan } from '../../../../door'

export default defineRoute({
  ability: 'box-office.ticket.admit',
  record: event => ['core.performance', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({
    code: z.string().min(1).max(300), // not-policy: shape bound
    deviceLabel: z.string().trim().min(1).max(40).optional(), // not-policy: shape bound
  }).strict(),
}, (_event, { input, record }) => scan({ performanceId: record!.id!, code: input.code, deviceLabel: input.deviceLabel }))
