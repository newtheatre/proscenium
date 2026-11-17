// The open schemes, for My account and the public component MembershipSchemes (MEM-10). Signed-out
// visitors see them only while membership.join.public-listing is on.
import { defineRoute, useSetting } from '#kit'
import { lengthOptions, listSchemes } from '../../../schemes'

export default defineRoute({ public: true, rateLimit: 'default' }, async (_event, { actor }) => {
  if (actor.kind !== 'person' && !(await useSetting('membership.join.public-listing'))) return { schemes: [] }
  const schemes = await listSchemes(['open'])
  const options = await lengthOptions(schemes.map(s => s.id), true)
  return {
    schemes: schemes.map(s => ({
      id: s.id, key: s.key, name: s.name, summary: s.summary, side: s.side, joinMode: s.joinMode, lengthRule: s.lengthRule,
      options: options.get(s.id)!.map(o => ({ id: o.id, name: o.name, count: o.count })),
    })),
  }
})
