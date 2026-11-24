// Accept, reject or ask for more (ID-40). Rejecting and asking need a message; accepting fewer
// companions than asked needs one too. The person is told by email, which names no need.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { decide } from '../../../../identity/access-scheme'

const message = z.string().trim().max(1000) // not-policy: room for a plain explanation

export default defineRoute({
  ability: 'core.access-scheme.review',
  record: event => ['core.account', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.discriminatedUnion('action', [
    z.object({ action: z.literal('accept'), companions: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(), message: message.optional() }).strict(),
    z.object({ action: z.literal('reject'), message }).strict(),
    z.object({ action: z.literal('ask'), message }).strict(),
  ]),
}, async (_event, { input, record, unit, actor }) => {
  await decide(unit, actor, record!.id, input)
  return { ok: true }
})
