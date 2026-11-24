// Change a person's name and pronouns for them (ID-46). The audit names
// the fields that changed, never what they say (0011).
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { editableAccount } from '../../../identity/staff-edit'

const name = z.string().trim().min(1).max(120) // not-policy: the column's own length check
const pronouns = z.string().trim().max(40) // not-policy: the column's own length check

export default defineRoute({
  ability: 'core.account.update',
  record: event => ['core.account', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({ name: name.optional(), pronouns: pronouns.nullable().optional() }).strict(),
}, async (_event, { input, unit, record }) => {
  const account = await editableAccount(record!.id)
  const changes: Record<string, string | null> = {}
  if (input.name !== undefined) changes.name = input.name
  if (input.pronouns !== undefined) changes.pronouns = input.pronouns || null
  const columns = Object.keys(changes)
  if (columns.length) {
    unit.add({ sql: `UPDATE core_accounts SET ${columns.map(c => `${c} = ?`).join(', ')} WHERE id = ? AND anonymised_at IS NULL AND merged_into_id IS NULL`, params: [...Object.values(changes), account.id] }).expect(1)
    unit.audit({ action: 'update', record: ['core.account', account.id], detail: { fields: Object.keys(input).filter(k => (input as Record<string, unknown>)[k] !== undefined) } })
  }
  return { updated: columns.length > 0 }
})
