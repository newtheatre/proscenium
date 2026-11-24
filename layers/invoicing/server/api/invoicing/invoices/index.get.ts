// S1 Invoices: drafts first, then those outstanding by due date, then settled ones.
import { can, defineRoute } from '#kit'
import { listInvoices } from '../../../invoices'

export default defineRoute({ ability: 'invoicing.invoice.view', rateLimit: 'default' }, async (_event, { actor }) => ({
  invoices: await listInvoices(),
  canDraft: (await can(actor, 'invoicing.invoice.draft')).allowed,
}))
