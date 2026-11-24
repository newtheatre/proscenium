// Who owes the theatre what, and for how long (IE-18, rule I-34): open invoices out, a row per party
// with its invoices beneath, the amounts in ageing bands by days past due in the theatre's time zone,
// most overdue first.
import { all, today } from '#kit'
import { daysBetween } from './invoices'

export const BANDS = ['current', '1-30', '31-60', '61-90', 'over-90'] as const
export type Band = typeof BANDS[number]
const LIMITS: [Band, number][] = [['current', 0], ['1-30', 30], ['31-60', 60], ['61-90', 90]] // not-policy: the bands rule I-34 names

export function bandOf(daysOverdue: number): Band {
  return LIMITS.find(([, most]) => daysOverdue <= most)?.[0] ?? 'over-90'
}

export interface Debtor {
  key: string
  name: string
  owedMinor: number
  daysOverdue: number
  bands: Record<Band, number>
  invoices: { id: string, number: string, dueOn: string, owedMinor: number, daysOverdue: number }[]
}

export async function debtors(): Promise<{ currency: string | null, totals: Record<Band, number>, debtors: Debtor[] }> {
  const rows = await all<{ id: string, number: string, partyModule: string | null, partyId: string | null, billToName: string, dueOn: string, owedMinor: number, currency: string }>(
    `SELECT id, number, party_module AS partyModule, party_id AS partyId, bill_to_name AS billToName, due_on AS dueOn, total_minor - allocated_minor AS owedMinor, currency
      FROM invoicing_invoices WHERE direction = 'out' AND kind = 'invoice' AND state = 'open' ORDER BY due_on`)
  const on = await today()
  const empty = () => Object.fromEntries(BANDS.map(b => [b, 0])) as Record<Band, number>
  const totals = empty()
  const byParty = new Map<string, Debtor>()
  for (const r of rows) {
    const daysOverdue = r.dueOn < on ? daysBetween(r.dueOn, on) : 0
    const key = r.partyModule ? `${r.partyModule}:${r.partyId}` : `name:${r.billToName.toLowerCase()}`
    const debtor = byParty.get(key) ?? { key, name: r.billToName, owedMinor: 0, daysOverdue: 0, bands: empty(), invoices: [] }
    const band = bandOf(daysOverdue)
    debtor.owedMinor += r.owedMinor
    debtor.daysOverdue = Math.max(debtor.daysOverdue, daysOverdue)
    debtor.bands[band] += r.owedMinor
    totals[band] += r.owedMinor
    debtor.invoices.push({ id: r.id, number: r.number, dueOn: r.dueOn, owedMinor: r.owedMinor, daysOverdue })
    byParty.set(key, debtor)
  }
  const list = [...byParty.values()].sort((a, b) => b.daysOverdue - a.daysOverdue || b.owedMinor - a.owedMinor)
  return { currency: rows[0]?.currency ?? null, totals, debtors: list }
}
