// Adds one entry by hand, or changes its end date and name if the value is already there (V19).
// One added here is kept when a file is loaded that does not hold it, until a file does.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, newId, nowMs, refuse } from '#kit'
import { hashValue, normalise, requireList, wellFormed } from '../../../../../lists'

export default defineRoute({
  ability: 'membership.verification-list.manage',
  record: event => ['membership.verification-list', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({
    value: z.string().trim().min(1).max(254), // not-policy: an address's bound
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(), // not-policy: the shape of a date
    name: z.string().trim().max(120).nullish(), // not-policy: the specification's bound
  }),
}, async (_event, { input, record, unit }) => {
  const list = await requireList(record!.id)
  if (list.keyKind === 'reference' && !wellFormed(list.referenceShape, normalise('reference', input.value)))
    refuse('membership.list.not-well-formed', 'That does not look like a reference on this list.', { status: 422, fields: { value: 'membership.list.not-well-formed' } })
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO membership_verification_entries (id, list_id, key_hash, ends_on, holder_name, by_hand, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)
          ON CONFLICT (list_id, key_hash) DO UPDATE SET ends_on = excluded.ends_on, holder_name = excluded.holder_name`,
    params: [newId('mve'), list.id, await hashValue(list.keyKind, input.value), input.endsOn ?? null, input.name || null, at],
  })
  unit.add({ sql: 'UPDATE membership_verification_lists SET entry_count = (SELECT count(*) FROM membership_verification_entries WHERE list_id = ?1) WHERE id = ?1', params: [list.id] })
  unit.audit({ action: 'update', record: ['membership.verification-list', list.id], detail: { entry: 'added' } })
  return { added: true }
})
