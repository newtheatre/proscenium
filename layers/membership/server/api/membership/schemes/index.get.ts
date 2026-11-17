// The open schemes, for My account and the public component MembershipSchemes (MEM-10). Signed-out
// visitors see them only while membership.join.public-listing is on.
import { defineRoute, useSetting } from '#kit'
import { schemeList } from '../../../lists'
import { lengthOptions, listSchemes } from '../../../schemes'

export default defineRoute({ public: true, rateLimit: 'default' }, async (_event, { actor }) => {
  if (actor.kind !== 'person' && !(await useSetting('membership.join.public-listing'))) return { schemes: [] }
  const schemes = await listSchemes(['open'])
  const options = await lengthOptions(schemes.map(s => s.id), true)
  // A scheme that checks a list of references asks for one when somebody joins, in the list's words.
  const asks = new Map<string, string | null>()
  for (const s of schemes) {
    const list = s.verifier ? await schemeList(s) : null
    asks.set(s.id, list?.keyKind === 'reference' ? list.referenceLabel : null)
  }
  return {
    schemes: schemes.map(s => ({
      id: s.id, key: s.key, name: s.name, summary: s.summary, side: s.side, joinMode: s.joinMode, lengthRule: s.lengthRule,
      options: options.get(s.id)!.map(o => ({ id: o.id, name: o.name, count: o.count })),
      asksFor: asks.get(s.id) ?? null,
    })),
  }
})
