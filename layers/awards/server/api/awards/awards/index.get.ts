// The console's list of awards: every award, newest first, narrowed by type, state or a name.
import { getQuery } from 'nuxt/server'
import { can, defineRoute } from '#kit'
import { listAwards } from '../../../awards'

export default defineRoute({ ability: 'awards.award.view', rateLimit: 'default' }, async (event, { actor }) => {
  const query = getQuery(event)
  const state = query.state === 'current' || query.state === 'revoked' ? query.state : undefined
  const awards = await listAwards({ typeId: query.type ? String(query.type) : undefined, state, q: query.q ? String(query.q).slice(0, 100) : undefined }) // not-policy: shape bound
  return {
    awards: awards.map(a => ({ id: a.id, typeId: a.typeId, typeName: a.typeName, recipientName: a.recipientName, awardedOn: a.awardedOn, awardedPrecision: a.awardedPrecision, awardedFor: a.awardedFor, state: a.state, visibility: a.visibility, linked: !!a.accountId })),
    canIssue: (await can(actor, 'awards.award.issue')).allowed,
  }
})
