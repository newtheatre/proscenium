// One list, without its contents, the schemes that check against it, and how many entries staff
// added that no file has held yet.
import { getRouterParam } from 'h3'
import { all, defineRoute, first } from '#kit'
import { hasListKey, requireList } from '../../../lists'

export default defineRoute({
  ability: 'membership.verification-list.manage',
  record: event => ['membership.verification-list', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const list = await requireList(record!.id)
  const schemes = await all<{ id: string, name: string }>('SELECT id, name FROM membership_schemes WHERE verifier = \'membership.list\' AND json_extract(verifier_config, \'$.listId\') = ? ORDER BY name', list.id)
  // Whether the list key is saved: without it nothing can be loaded or checked.
  const hand = await first<{ n: number }>('SELECT count(*) AS n FROM membership_verification_entries WHERE list_id = ? AND by_hand = 1', list.id)
  return { list, schemes, keySet: await hasListKey(), byHand: hand?.n ?? 0 }
})
