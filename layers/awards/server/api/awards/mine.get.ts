// My awards: what the signed-in person holds, with the citation and where each is listed. A revoked
// award is not shown. One that carries a ticket price has a card to show a seller.
import { defineRoute } from '#kit'
import { listTypes } from '../../types'
import { awardsOf } from '../../awards'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const awards = actor.accountId ? (await awardsOf(actor.accountId)).filter(a => a.state === 'current') : []
  const carries = new Set((await listTypes()).filter(t => t.givesTicketBenefit).map(t => t.id))
  return { awards: awards.map(a => ({ id: a.id, card: carries.has(a.typeId), typeName: a.typeName, recipientName: a.recipientName, awardedOn: a.awardedOn, awardedPrecision: a.awardedPrecision, awardedFor: a.awardedFor, citation: a.citation, visibility: a.visibility })) }
})
