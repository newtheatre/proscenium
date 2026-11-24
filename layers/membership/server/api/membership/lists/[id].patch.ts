// Renames a list, or changes its label, noun, shape or the date after which it matches nothing.
import { getRouterParam } from 'nuxt/server'
import { defineRoute, refuse } from '#kit'
import { listInput } from '../../../list-input'
import { requireList } from '../../../lists'

export default defineRoute({
  ability: 'membership.verification-list.manage',
  record: event => ['membership.verification-list', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: listInput.omit({ keyKind: true }).partial(),
}, async (_event, { input, record, unit }) => {
  const list = await requireList(record!.id)
  const label = input.referenceLabel !== undefined ? input.referenceLabel : list.referenceLabel
  if (list.keyKind === 'reference' && !label) refuse('membership.list.label-needed', 'A list of references needs the sentence its field shows.', { status: 422, fields: { referenceLabel: 'membership.list.label-needed' } })
  const noun = input.referenceNoun !== undefined ? input.referenceNoun : list.referenceNoun
  if (list.keyKind === 'reference' && !noun) refuse('membership.list.noun-needed', 'A list of references needs a short name for the reference, such as "student ID".', { status: 422, fields: { referenceNoun: 'membership.list.noun-needed' } })
  unit.add({
    sql: 'UPDATE membership_verification_lists SET name = ?, valid_until = ?, reference_label = ?, reference_noun = ?, reference_shape = ? WHERE id = ?',
    params: [input.name ?? list.name, input.validUntil !== undefined ? input.validUntil : list.validUntil, label, list.keyKind === 'reference' ? noun : null, input.referenceShape !== undefined ? (input.referenceShape ? JSON.stringify(input.referenceShape) : null) : (list.referenceShape ? JSON.stringify(list.referenceShape) : null), list.id],
  }).expect(1)
  unit.audit({ action: 'update', record: ['membership.verification-list', list.id] })
  return { listId: list.id }
})
