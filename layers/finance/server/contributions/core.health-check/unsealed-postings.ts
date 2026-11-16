// A posting, its entries and its seal travel in one batch, so an unsealed posting cannot survive a
// commit. This counts them anyway and expects none.
import { first } from '#kit'

export default {
  async check() {
    const row = await first<{ n: number }>('SELECT count(*) AS n FROM finance_postings p WHERE NOT EXISTS (SELECT 1 FROM finance_seals s WHERE s.posting_id = p.id)')
    const n = row?.n ?? 0
    if (n) return { state: 'failing', sentence: `${n === 1 ? 'One posting has' : `${n} postings have`} no seal, so the ledger does not include ${n === 1 ? 'it' : 'them'}.`, remedy: 'Report this as a fault: a posting is always sealed in the change that writes it.' }
    return { state: 'ok', sentence: 'Every posting in the ledger is sealed.' }
  },
} satisfies { check: () => Promise<{ state: 'ok' | 'warning' | 'failing', sentence: string, remedy?: string }> }
