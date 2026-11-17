// My awards: what the signed-in person holds, with the citation and where each is listed. A revoked
// award is not shown.
import { defineRoute } from '#kit'
import { awardsOf } from '../../awards'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const awards = actor.accountId ? (await awardsOf(actor.accountId)).filter(a => a.state === 'current') : []
  return { awards: awards.map(a => ({ id: a.id, typeName: a.typeName, recipientName: a.recipientName, awardedOn: a.awardedOn, awardedFor: a.awardedFor, citation: a.citation, visibility: a.visibility })) }
})
