// Adds a tax code, such as a new rate when HMRC changes one: a used code's rate never changes.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { TAX_CODE_INPUT } from '../../../shared/tax'

export default defineRoute({
  ability: 'finance.settings.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ code: TAX_CODE_INPUT.code, label: TAX_CODE_INPUT.label, rateBasisPoints: TAX_CODE_INPUT.rate, inScope: z.boolean() }),
}, async (_event, { input, unit }) => {
  unit.add({ sql: 'INSERT OR IGNORE INTO finance_tax_codes (code, label, rate_basis_points, active, in_scope) VALUES (?, ?, ?, 1, ?)', params: [input.code, input.label, input.rateBasisPoints, input.inScope ? 1 : 0] })
    .expect(1, { code: 'finance.tax-code.taken', reason: `There is already a tax code ${input.code}.` })
  unit.audit({ action: 'create', detail: { taxCode: input.code, rateBasisPoints: input.rateBasisPoints } })
  return { code: input.code }
})
