// Change my name and my pronouns (ID-11). The label other modules show reads the account, so
// the change shows everywhere at once.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { sessionOf } from '../../identity/guards'

const name = z.string().trim().min(1).max(120) // not-policy: the column's own length check
const pronouns = z.string().trim().max(40) // not-policy: the column's own length check

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ name: name.nullable().optional(), pronouns: pronouns.nullable().optional() }).strict(),
}, async (event, { input, unit, actor }) => {
  const session = await sessionOf(event)
  const sets: string[] = []
  const params: unknown[] = []
  if (input.name !== undefined) {
    sets.push('name = ?')
    params.push(input.name || null)
  }
  if (input.pronouns !== undefined) {
    sets.push('pronouns = ?')
    params.push(input.pronouns || null)
  }
  if (sets.length) {
    unit.add({ sql: `UPDATE core_accounts SET ${sets.join(', ')} WHERE id = ? AND anonymised_at IS NULL`, params: [...params, session.accountId] }).expect(1)
    unit.audit({ action: 'update', record: ['core.account', actor.accountId!], detail: { fields: Object.keys(input).filter(k => (input as any)[k] !== undefined) } })
  }
  return { updated: sets.length > 0 }
})
