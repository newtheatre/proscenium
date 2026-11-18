// The roll of honour, for the public page and the ::awards-roll component: listed awards by type,
// or one type's by its web address. "Not found" while the roll is not public. Somebody with a
// members' standing also sees the awards listed to members only.
import { getQuery } from 'h3'
import { defineRoute, fact, isEnabled, refuse, useSetting } from '#kit'
import { roll } from '../../roll'
import { KEY } from '../../types'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event, { actor }) => {
  if (!await useSetting('awards.roll.public')) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  const type = getQuery(event).type
  const typeKey = typeof type === 'string' && KEY.test(type) ? type : undefined
  const members = actor.kind === 'person' && !!actor.accountId && await fact('core.member', actor)
  // With the form builder on, the page offers whichever nomination forms the viewer could answer now.
  return { types: await roll({ members, typeKey }), nominations: await isEnabled('forms') }
})
