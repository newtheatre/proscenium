// Creates an award type: "Fellowship", "Commendation". It can be given straight away.
import { defineRoute, newId, nowMs } from '#kit'
import { typeFields } from '../../../types'

const input = typeFields.omit({ state: true }).partial({ summary: true, givesTicketBenefit: true, onePerPerson: true, defaultVisibility: true })

export default defineRoute({ ability: 'awards.type.manage', rateLimit: 'write', idempotent: true, input }, async (_event, { input, unit }) => {
  const id = newId('awt')
  const at = nowMs()
  unit.add({
    sql: `INSERT OR IGNORE INTO awards_types (id, key, name, summary, gives_ticket_benefit, one_per_person, default_visibility, state, position, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'active', (SELECT coalesce(max(position), 0) + 1 FROM awards_types), ?, ?)`,
    params: [id, input.key, input.name, input.summary ?? null, input.givesTicketBenefit ? 1 : 0, (input.onePerPerson ?? true) ? 1 : 0, input.defaultVisibility ?? 'public', at, at],
  }).expect(1, { code: 'awards.type.key-taken', reason: `Another award already uses the address ${input.key}.` })
  unit.audit({ action: 'create', record: ['awards.type', id] })
  return { typeId: id }
})
