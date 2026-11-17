// Fees paid with no income posted for them (tab 4, core.health-check). Expected to be none: the
// charge is paid and the income posted in Payments' one batch.
import { first } from '#kit'

export default {
  async check() {
    const row = await first<{ n: number }>(`SELECT count(*) AS n FROM membership_fees_charges c
      WHERE c.state IN ('paid', 'part-refunded', 'refunded') AND c.intent_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM finance_postings p JOIN finance_entries e ON e.posting_id = p.id WHERE p.source_type = 'payments.intent' AND p.source_id = c.intent_id AND e.for_module = 'membership-fees')`)
    const n = row?.n ?? 0
    if (n) return { state: 'failing' as const, sentence: `${n === 1 ? 'One membership fee is' : `${n} membership fees are`} marked paid with no income posted in the ledger.`, remedy: 'Compare them with the payments under Finance before the period is closed.' }
    return { state: 'ok' as const, sentence: 'Every membership fee paid has its income in the ledger.' }
  },
}
