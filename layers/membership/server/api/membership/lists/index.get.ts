// The verification lists: name, kind, how many entries and until when. Never their contents.
import { defineRoute } from '#kit'
import { hasListKey, listLists } from '../../../lists'

export default defineRoute({ ability: 'membership.verification-list.manage', rateLimit: 'default' }, async () => {
  return { lists: await listLists(), keySet: await hasListKey() }
})
