// A member takes a place that needs cover (FH-14).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { takeCover } from '../../../../people'

export default defineRoute({
  ability: 'front-of-house.shift.sign-up',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, (event, { actor, unit }) => takeCover(unit.view(), getRouterParam(event, 'id')!, actor.accountId!))
