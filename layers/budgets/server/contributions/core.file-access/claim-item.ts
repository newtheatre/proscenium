// Receipts on a claim's item: read by its claimant, an approver of its lines, and view-all.
import type { FileAccess } from '#modules/core'
import { getClaim, mayView } from '../../claims'
import { first } from '#kit'

export default {
  async canRead(actor, record) {
    const item = await first<{ claimId: string }>('SELECT claim_id AS claimId FROM budgets_claim_items WHERE id = ?', record.id)
    const claim = item ? await getClaim(item.claimId) : null
    return !!claim && await mayView(actor, claim)
  },
} satisfies FileAccess
