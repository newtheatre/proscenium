// Opens my till session with a float (PAY-03).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { getSession, openSession, summarise } from '../../sessions'

export default defineRoute({
  ability: 'payments.session.open',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    pointLabel: z.string().trim().min(1).max(60), // not-policy: a name for the till, such as "Box office desk"
    floatMinor: z.number().int().min(0).optional(),
  }).strict(),
}, async (_event, { input, actor, unit }) => {
  const id = await openSession(unit.view(), { accountId: actor.accountId!, pointLabel: input.pointLabel, floatMinor: input.floatMinor })
  await unit.commit()
  return { session: await summarise((await getSession(id))!) }
})
