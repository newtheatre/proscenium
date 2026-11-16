// Renames, recodes or retires an account. A module's declared account cannot be retired, and an
// account is never deleted.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, first, nowMs, refuse } from '#kit'

export default defineRoute({
  ability: 'finance.account.manage',
  record: event => ['finance.account', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({
    code: z.string().trim().min(1).max(40).optional(), // not-policy: a nominal code's bound
    name: z.string().trim().min(1).max(80).optional(), // not-policy: an account name's bound
    active: z.boolean().optional(),
  }),
}, async (_event, { input, record, unit }) => {
  const account = await first<{ id: string, code: string, name: string, active: number, system_key: string | null }>('SELECT id, code, name, active, system_key FROM finance_accounts WHERE id = ?', record!.id)
  if (!account) refuse('core.not-found', 'There is no such account.', { status: 404 })
  if (input.active === false && account!.system_key) refuse('finance.account.locked', 'This account belongs to a module and cannot be retired. You can rename and recode it.', { status: 409 })
  if (input.code && input.code !== account!.code && await first('SELECT 1 FROM finance_accounts WHERE code = ? AND id <> ?', input.code, account!.id))
    refuse('finance.account.code-taken', `Another account already has the code ${input.code}.`, { status: 409, fields: { code: 'finance.account.code-taken' } })
  unit.add({
    sql: 'UPDATE finance_accounts SET code = ?, name = ?, active = ?, updated_at = ? WHERE id = ?',
    params: [input.code ?? account!.code, input.name ?? account!.name, input.active === undefined ? account!.active : (input.active ? 1 : 0), nowMs(), account!.id],
  }).expect(1)
  unit.audit({ action: 'update', record: ['finance.account', account!.id], detail: { code: input.code !== undefined, name: input.name !== undefined, active: input.active ?? null } })
  return { accountId: account!.id }
})
