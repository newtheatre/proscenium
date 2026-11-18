// The open schemes, for My account and the public component MembershipSchemes (MEM-10). Signed-out
// visitors see them only while membership.join.public-listing is on. A scheme that requires payment
// shows the fee for joining at each length, and says when it cannot be joined online (S5).
import { defineRoute, useSetting } from '#kit'
import { charger } from '../../../charge'
import { listSetsEnd, schemeList } from '../../../lists'
import { todayOrNull } from '../../../memberships'
import { lengthOptions, listSchemes } from '../../../schemes'

export default defineRoute({ public: true, rateLimit: 'default' }, async (_event, { actor }) => {
  if (actor.kind !== 'person' && !(await useSetting('membership.join.public-listing'))) return { schemes: [] }
  const schemes = await listSchemes(['open'])
  const options = await lengthOptions(schemes.map(s => s.id), true)
  // A scheme that checks a list of references asks for one when somebody joins, in the list's words.
  // D9: where the list's entries carry end dates, no length is asked for.
  const asks = new Map<string, string | null>()
  const endsByList = new Set<string>()
  for (const s of schemes) {
    const list = s.verifier ? await schemeList(s) : null
    asks.set(s.id, list?.keyKind === 'reference' ? list.referenceLabel : null)
    if (await listSetsEnd(list)) endsByList.add(s.id)
  }
  const fees = await charger()
  const day = await todayOrNull()
  const fee = async (schemeId: string, lengthOptionId: string | null) => fees && day ? await fees.priceFor(schemeId, lengthOptionId, 'join', day) : null
  return {
    schemes: await Promise.all(schemes.map(async s => ({
      id: s.id, key: s.key, name: s.name, summary: s.summary, side: s.side, joinMode: s.joinMode, lengthRule: s.lengthRule,
      options: await Promise.all(options.get(s.id)!.map(async o => ({ id: o.id, name: o.name, count: o.count, fee: s.requiresPayment ? await fee(s.id, o.id) : null }))),
      fee: s.requiresPayment && s.lengthRule === 'indefinite' ? await fee(s.id, null) : null,
      requiresPayment: s.requiresPayment,
      online: !s.requiresPayment || !!fees,
      asksFor: asks.get(s.id) ?? null,
      endsByList: endsByList.has(s.id),
    }))),
  }
})
