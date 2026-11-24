// An invoice's PDF, or a bill's supplier file: read by whoever may see that invoice or bill.
import { can, first } from '#kit'
import type { FileAccess } from '#modules/core'

export default {
  canRead: async (actor, record) => {
    const bill = await first<{ direction: string }>('SELECT direction FROM invoicing_invoices WHERE id = ?', record.id)
    return (await can(actor, bill?.direction === 'in' ? 'invoicing.bill.view' : 'invoicing.invoice.view', { type: 'invoicing.invoice', id: record.id })).allowed
  },
} satisfies FileAccess
