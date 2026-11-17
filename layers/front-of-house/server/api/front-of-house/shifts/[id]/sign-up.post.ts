// A member takes a place on a shift (FH-04, the core of FH-10).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { signUp } from '../../../../assignments'

export default defineRoute({
  ability: 'front-of-house.shift.sign-up',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { actor, unit }) => signUp(unit.view(), { shiftId: getRouterParam(event, 'id')!, accountId: actor.accountId! }))
