// Edits an award type, or archives and restores it. The address is fixed once anybody holds the
// award, because the roll of honour may be linked by it. Archiving keeps every holder and their
// ticket benefit; it only stops new awards.
import { getRouterParam } from 'h3'
import { defineRoute, nowMs, refuse } from '#kit'
import { hasAwards, requireType, typeFields } from '../../../types'

const COLUMN: Record<string, string> = {
  key: 'key', name: 'name', summary: 'summary', givesTicketBenefit: 'gives_ticket_benefit', onePerPerson: 'one_per_person', defaultVisibility: 'default_visibility', state: 'state',
}

export default defineRoute({
  ability: 'awards.type.manage',
  record: event => ['awards.type', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: typeFields.partial(),
}, async (_event, { input, record, unit }) => {
  const type = await requireType(record!.id)
  if (input.key !== undefined && input.key !== type.key && await hasAwards(type.id))
    refuse('awards.type.key-fixed', 'The address cannot change once the award has been given, because people may have it saved.', { status: 409, fields: { key: 'awards.type.key-fixed' } })
  const changed = Object.keys(input).filter(k => (input as Record<string, unknown>)[k] !== undefined && (input as Record<string, unknown>)[k] !== (type as unknown as Record<string, unknown>)[k])
  if (!changed.length) return { typeId: type.id }
  const value = (k: string) => {
    const v = (input as Record<string, unknown>)[k]
    return typeof v === 'boolean' ? (v ? 1 : 0) : v ?? null
  }
  unit.add({
    sql: `UPDATE OR IGNORE awards_types SET ${changed.map(k => `${COLUMN[k]} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    params: [...changed.map(value), nowMs(), type.id],
  }).expect(1, { code: 'awards.type.key-taken', reason: 'Another award already uses that address.' })
  unit.audit({ action: 'update', record: ['awards.type', type.id], detail: { fields: changed } })
  return { typeId: type.id }
})
