// CO-24, rule D3: adds someone from the company; contacts until the first date starts, staff after.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { requireEngagement } from '../../../../engagements'
import { addPerson, personInput, requirePeopleAccess } from '../../../../people'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: personInput }, async (event, { input, actor, unit }) => {
  const engagement = await requireEngagement(getRouterParam(event, 'id') ?? '')
  await requirePeopleAccess(actor, engagement)
  return { personId: addPerson({ unit, actor, engagement }, input) }
})
