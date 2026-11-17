// Deletes a list and every entry on it. Refused while a scheme checks against it.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, refuse } from '#kit'
import { requireList } from '../../../lists'

export default defineRoute({
  ability: 'membership.verification-list.manage',
  record: event => ['membership.verification-list', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { record, unit }) => {
  const list = await requireList(record!.id)
  if (await first('SELECT 1 FROM membership_schemes WHERE verifier = \'membership.list\' AND json_extract(verifier_config, \'$.listId\') = ?', list.id))
    refuse('membership.list.in-use', 'A scheme checks against this list.', { status: 409, remedy: 'Choose another list on the scheme first.' })
  if (await first('SELECT 1 FROM membership_verifications v JOIN membership_verification_entries e ON e.id = v.entry_id WHERE e.list_id = ? LIMIT 1', list.id))
    refuse('membership.list.has-history', 'Memberships were verified against this list, so it is kept as their record.', { status: 409, remedy: 'Set the date after which it matches nothing instead.' })
  unit.add({ sql: 'DELETE FROM membership_verification_entries WHERE list_id = ?', params: [list.id] })
  unit.add({ sql: 'DELETE FROM membership_verification_lists WHERE id = ?', params: [list.id] }).expect(1)
  unit.audit({ action: 'delete', record: ['membership.verification-list', list.id] })
  return { deleted: true }
})
