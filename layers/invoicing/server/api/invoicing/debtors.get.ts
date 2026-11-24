// S5 Owed to us: each party's open invoices, aged (IE-18).
import { defineRoute } from '#kit'
import { debtors } from '../../debtors'

export default defineRoute({ ability: 'invoicing.invoice.view', rateLimit: 'default' }, async () => debtors())
