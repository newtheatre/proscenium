// One list, without its contents, and the schemes that check against it.
import { getRouterParam } from 'h3'
import { all, defineRoute } from '#kit'
import { requireList } from '../../../lists'

export default defineRoute({
  ability: 'membership.verification-list.manage',
  record: event => ['membership.verification-list', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const list = await requireList(record!.id)
  const schemes = await all<{ id: string, name: string }>('SELECT id, name FROM membership_schemes WHERE verifier = \'membership.list\' AND json_extract(verifier_config, \'$.listId\') = ? ORDER BY name', list.id)
  return { list, schemes }
})
