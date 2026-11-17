// Checks one value against a list (V19): whether it is on it, until when, and in whose name. Never
// shows the list. Audited as a read of the list.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, today } from '#kit'
import { hashValue, requireList } from '../../../../lists'

export default defineRoute({
  ability: 'membership.verification-list.check',
  record: event => ['membership.verification-list', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ value: z.string().trim().min(1).max(254) }), // not-policy: an address's bound
}, async (_event, { input, record }) => {
  const list = await requireList(record!.id)
  const entry = await first<{ ends_on: string | null, holder_name: string | null, used_by: string | null }>(
    'SELECT ends_on, holder_name, used_by FROM membership_verification_entries WHERE list_id = ? AND key_hash = ?',
    list.id, await hashValue(list.keyKind, input.value),
  )
  if (!entry) return { found: false }
  const day = await today()
  const current = (!entry.ends_on || entry.ends_on >= day) && (!list.validUntil || list.validUntil >= day)
  return { found: true, current, endsOn: entry.ends_on, name: entry.holder_name, claimed: !!entry.used_by }
})
