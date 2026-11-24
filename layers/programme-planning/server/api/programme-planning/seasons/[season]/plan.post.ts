// PP-01: "Start a plan". A second start for the same season opens the existing plan.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { seasonFor, startPlan } from '../../../../plans'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: z.object({}).strict() }, async (event, { actor, unit }) => {
  const season = await seasonFor(actor, getRouterParam(event, 'season'), 'programme-planning.plan.manage')
  return startPlan(unit, season)
})
