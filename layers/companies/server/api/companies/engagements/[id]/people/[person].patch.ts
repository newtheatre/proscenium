// CO-24, rule D3: changes someone from the company.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { requireEngagement } from '../../../../../engagements'
import { changePerson, personInput, requirePeopleAccess } from '../../../../../people'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: personInput }, async (event, { input, actor, unit }) => {
  const engagement = await requireEngagement(getRouterParam(event, 'id') ?? '')
  await requirePeopleAccess(actor, engagement)
  changePerson({ unit, actor, engagement }, getRouterParam(event, 'person') ?? '', input)
  return { changed: true }
})
