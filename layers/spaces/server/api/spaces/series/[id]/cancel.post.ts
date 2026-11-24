// Cancels the dates of a series not yet started: from one of them on, or all (SP-21, rules R6 and R7).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { cancelSeries } from '../../../../series'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ from: z.string().min(1).max(40).nullish() }).strict(), // not-policy: shape bound
}, async (event, { actor, input, unit }) => await cancelSeries(unit.view(), actor, getRouterParam(event, 'id')!, input.from ?? null))
