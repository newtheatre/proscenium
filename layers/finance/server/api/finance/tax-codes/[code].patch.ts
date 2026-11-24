// Renames a tax code, or stops or restarts its use. Its rate and scope change only while no entry
// uses it; the database refuses the rest (F-A2). none is always in use.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, first, refuse } from '#kit'
import { TAX_CODE_INPUT } from '../../../../shared/tax'

export default defineRoute({
  ability: 'finance.settings.manage',
  rateLimit: 'write',
  input: z.object({ label: TAX_CODE_INPUT.label.optional(), rateBasisPoints: TAX_CODE_INPUT.rate.optional(), inScope: z.boolean().optional(), active: z.boolean().optional() }),
}, async (event, { input, unit }) => {
  const code = getRouterParam(event, 'code') ?? ''
  const row = await first<{ code: string, label: string, rate_basis_points: number, active: number, in_scope: number, used: number }>(
    "SELECT code, label, rate_basis_points, active, in_scope, (code = 'none' OR EXISTS (SELECT 1 FROM finance_entries WHERE tax_code = ?)) AS used FROM finance_tax_codes WHERE code = ?", code, code)
  if (!row) refuse('core.not-found', 'There is no such tax code.', { status: 404 })
  const rate = input.rateBasisPoints ?? row!.rate_basis_points
  const inScope = input.inScope === undefined ? row!.in_scope === 1 : input.inScope
  if (row!.used && (rate !== row!.rate_basis_points || inScope !== (row!.in_scope === 1)))
    refuse('finance.tax-code.used', 'This code is already on the ledger, so its rate cannot change. Add a new code with the new rate and stop using this one.', { status: 409, fields: { rateBasisPoints: 'finance.tax-code.used' } })
  if (row!.code === 'none' && input.active === false) refuse('finance.tax-code.none', 'The code for no tax is always in use.', { status: 409 })
  unit.add({
    sql: 'UPDATE finance_tax_codes SET label = ?, rate_basis_points = ?, in_scope = ?, active = ? WHERE code = ?',
    params: [input.label ?? row!.label, rate, inScope ? 1 : 0, input.active === undefined ? row!.active : (input.active ? 1 : 0), row!.code],
  }).expect(1)
  unit.audit({ action: 'update', detail: { taxCode: row!.code, label: input.label !== undefined, rateBasisPoints: rate, active: input.active ?? null } })
  return { code: row!.code }
})
