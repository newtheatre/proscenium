// Opens my till session (PAY-03) at a space, with an optional note and a float where cash is taken.
// The till opens one by itself (till/session.post); this is for opening one by hand.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { getSession, openSession, summarise } from '../../sessions'

export default defineRoute({
  ability: 'payments.session.open',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    spaceId: z.string().max(40).nullable().optional(), // not-policy: an id's length
    pointLabel: z.string().trim().max(60).optional(), // not-policy: a note on the till, such as "Box office desk"
    floatMinor: z.number().int().min(0).optional(),
  }).strict(),
}, async (_event, { input, actor, unit }) => {
  const id = await openSession(unit.view(), { accountId: actor.accountId!, spaceId: input.spaceId, pointLabel: input.pointLabel, floatMinor: input.floatMinor })
  await unit.commit()
  return { session: await summarise((await getSession(id))!) }
})
