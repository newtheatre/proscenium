// Logs a supplier's bill as a draft (IE-19).
import { defineRoute } from '#kit'
import { billFields } from '../../../../shared/invoices'
import { createBill } from '../../../bills'

export default defineRoute({ ability: 'invoicing.bill.log', rateLimit: 'write', idempotent: true, input: billFields }, async (_event, { input, unit, actor }) => (
  { billId: await createBill(unit, actor, input) }
))
