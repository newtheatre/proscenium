// What a new draft may be written with: income accounts and, while VAT-registered, the codes.
import { defineRoute } from '#kit'
import { draftChoices } from '../../../invoices'

export default defineRoute({ ability: 'invoicing.invoice.draft', rateLimit: 'default' }, async () => draftChoices())
