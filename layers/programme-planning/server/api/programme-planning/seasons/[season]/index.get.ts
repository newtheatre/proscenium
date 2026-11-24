// A season's plan overview (screen 2): the plan, if started, its entries by state and placed against wanted.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { mayOn, overviewOf, planOfSeason, seasonFor } from '../../../../plans'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const season = await seasonFor(actor, getRouterParam(event, 'season'), 'programme-planning.plan.view')
  const plan = await planOfSeason(season.id)
  return { season, plan, overview: plan ? await overviewOf(plan.id) : null, may: await mayOn(actor, season.id, plan?.id ?? null) }
})
