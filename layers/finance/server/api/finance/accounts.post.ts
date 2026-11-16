// Adds an account to the chart and gives it to one module, which alone may post to it (such as a
// snacks income account given to the bar).
import { z } from 'zod'
import { defineRoute, newId, nowMs, refuse } from '#kit'
import { useRegistry } from '#kit/registry'

export default defineRoute({
  ability: 'finance.account.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    code: z.string().trim().min(1).max(40), // not-policy: a nominal code's bound
    name: z.string().trim().min(1).max(80), // not-policy: an account name's bound
    kind: z.enum(['asset', 'liability', 'income', 'expense', 'equity']),
    module: z.string().regex(/^[a-z][a-z0-9-]*$/), // not-policy: the shape of a module id
  }),
}, async (_event, { input, unit }) => {
  if (!useRegistry().modules.has(input.module)) refuse('finance.account.unknown-module', `There is no module called ${input.module}.`, { status: 422, fields: { module: 'finance.account.unknown-module' } })
  const id = newId('lac')
  const at = nowMs()
  unit.add({ sql: 'INSERT OR IGNORE INTO finance_accounts (id, code, name, kind, module, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)', params: [id, input.code, input.name, input.kind, input.module, at, at] })
    .expect(1, { code: 'finance.account.code-taken', reason: `Another account already has the code ${input.code}.` })
  unit.audit({ action: 'create', record: ['finance.account', id] })
  return { accountId: id }
})
