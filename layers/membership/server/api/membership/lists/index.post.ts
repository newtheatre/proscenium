// Creates an empty list (its upload time is 0 until a file is loaded), and the list key with the first one. A reference list needs the whole phrase its checkout field shows (V13).
import { defineRoute, newId, nowMs, refuse } from '#kit'
import { listInput } from '../../../list-input'
import { ensureListKey } from '../../../lists'

export default defineRoute({ ability: 'membership.verification-list.manage', rateLimit: 'write', idempotent: true, input: listInput }, async (_event, { input, actor, unit }) => {
  if (input.keyKind === 'reference' && !input.referenceLabel)
    refuse('membership.list.label-needed', 'A list of references needs the sentence its field shows, naming the membership and who issues the reference.', { status: 422, fields: { referenceLabel: 'membership.list.label-needed' } })
  if (input.keyKind === 'reference' && !input.referenceNoun)
    refuse('membership.list.noun-needed', 'A list of references needs a short name for the reference, such as "student ID".', { status: 422, fields: { referenceNoun: 'membership.list.noun-needed' } })
  const id = newId('mvl')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO membership_verification_lists (id, name, key_kind, entry_count, valid_until, uploaded_by, uploaded_at, reference_label, reference_noun, reference_shape, created_at)
          VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
    params: [id, input.name, input.keyKind, input.validUntil ?? null, actor.accountId, 0, input.keyKind === 'reference' ? input.referenceLabel : null, input.keyKind === 'reference' ? input.referenceNoun : null, input.referenceShape ? JSON.stringify(input.referenceShape) : null, at],
  }).expect(1)
  await ensureListKey(unit, actor.accountId ?? null)
  unit.audit({ action: 'create', record: ['membership.verification-list', id] })
  return { listId: id }
})
