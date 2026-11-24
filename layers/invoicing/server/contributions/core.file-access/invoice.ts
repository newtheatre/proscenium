// An invoice's PDF: read by whoever may see that invoice.
import { can } from '#kit'
import type { FileAccess } from '#modules/core'

export default {
  canRead: async (actor, record) => (await can(actor, 'invoicing.invoice.view', { type: 'invoicing.invoice', id: record.id })).allowed,
} satisfies FileAccess
