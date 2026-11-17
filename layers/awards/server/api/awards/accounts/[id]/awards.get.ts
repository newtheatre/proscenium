// A person's awards, for the Awards tab on their console page: every one of theirs, newest first.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { awardsOf } from '../../../../awards'

export default defineRoute({ ability: 'awards.award.view', rateLimit: 'default' }, async (event) => {
  const awards = await awardsOf(getRouterParam(event, 'id')!)
  return { awards: awards.map(a => ({ id: a.id, typeName: a.typeName, awardedOn: a.awardedOn, awardedFor: a.awardedFor, state: a.state })) }
})
