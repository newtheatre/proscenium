// Removes one entry, found by typing its value (V19). An entry a membership was verified by is kept
// as that record, ended and without its name.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, first, refuse, today } from '#kit'
import { addDays } from '../../../../../dates'
import { hashValue, requireList } from '../../../../../lists'

export default defineRoute({
  ability: 'membership.verification-list.manage',
  record: event => ['membership.verification-list', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({ value: z.string().trim().min(1).max(254) }), // not-policy: an address's bound
}, async (_event, { input, record, unit }) => {
  const list = await requireList(record!.id)
  const hash = await hashValue(list.keyKind, input.value)
  if (!(await first('SELECT 1 FROM membership_verification_entries WHERE list_id = ? AND key_hash = ?', list.id, hash)))
    refuse('membership.list.not-found', 'That is not on this list.', { status: 404 })
  const used = 'id IN (SELECT entry_id FROM membership_verifications WHERE entry_id IS NOT NULL)'
  unit.add({ sql: `UPDATE membership_verification_entries SET ends_on = ?3, holder_name = NULL WHERE list_id = ?1 AND key_hash = ?2 AND ${used}`, params: [list.id, hash, addDays(await today(), -1)] })
  unit.add({ sql: `DELETE FROM membership_verification_entries WHERE list_id = ?1 AND key_hash = ?2 AND NOT ${used}`, params: [list.id, hash] })
  unit.add({ sql: 'UPDATE membership_verification_lists SET entry_count = (SELECT count(*) FROM membership_verification_entries WHERE list_id = ?1) WHERE id = ?1', params: [list.id] })
  unit.audit({ action: 'update', record: ['membership.verification-list', list.id], detail: { entry: 'removed' } })
  return { removed: true }
})
