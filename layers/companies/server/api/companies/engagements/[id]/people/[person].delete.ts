// CO-24, rule D3: removes someone from the company's list.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireEngagement } from '../../../../../engagements'
import { removePerson, requirePeopleAccess } from '../../../../../people'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}).strict() }, async (event, { actor, unit }) => {
  const engagement = await requireEngagement(getRouterParam(event, 'id') ?? '')
  await requirePeopleAccess(actor, engagement)
  removePerson({ unit, actor, engagement }, getRouterParam(event, 'person') ?? '')
  return { removed: true }
})
