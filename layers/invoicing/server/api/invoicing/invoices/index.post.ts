// A new draft invoice (IE-08).
import { defineRoute } from '#kit'
import { draftFields } from '../../../../shared/invoices'
import { createDraft } from '../../../invoices'

export default defineRoute({ ability: 'invoicing.invoice.draft', rateLimit: 'write', idempotent: true, input: draftFields }, async (_event, { input, unit, actor }) => (
  { invoiceId: await createDraft(unit, actor, input) }
))
