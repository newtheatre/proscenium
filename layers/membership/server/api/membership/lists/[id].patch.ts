// Renames a list, or changes its label, shape or the date after which it matches nothing.
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { listInput } from '../../../list-input'
import { requireList } from '../../../lists'

export default defineRoute({
  ability: 'membership.verification-list.manage',
  record: event => ['membership.verification-list', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: listInput.omit({ keyKind: true }).partial(),
}, async (_event, { input, record, unit }) => {
  const list = await requireList(record!.id)
  const label = input.referenceLabel !== undefined ? input.referenceLabel : list.referenceLabel
  if (list.keyKind === 'reference' && !label) refuse('membership.list.label-needed', 'A list of references needs the sentence its field shows.', { status: 422, fields: { referenceLabel: 'membership.list.label-needed' } })
  unit.add({
    sql: 'UPDATE membership_verification_lists SET name = ?, valid_until = ?, reference_label = ?, reference_shape = ? WHERE id = ?',
    params: [input.name ?? list.name, input.validUntil !== undefined ? input.validUntil : list.validUntil, label, input.referenceShape !== undefined ? (input.referenceShape ? JSON.stringify(input.referenceShape) : null) : (list.referenceShape ? JSON.stringify(list.referenceShape) : null), list.id],
  }).expect(1)
  unit.audit({ action: 'update', record: ['membership.verification-list', list.id] })
  return { listId: list.id }
})
