// Tax codes on ticket money (BO-78). Ticket money is shared out by performance; with VAT it is shared
// by performance and code, in a key of both, so the entries tell Payments which VAT is inside each.
import { all } from '#kit'
import { defaultTaxCode } from '#modules/finance'

const SEP = '\t'

/** A key of a performance and the tax code its ticket money includes. */
export const coded = (performanceId: string, taxCode: string): string => `${performanceId}${SEP}${taxCode}`

/** A key's performance and code; a plain performance id has no code. */
export function uncoded(key: string): { performanceId: string, taxCode: string | null } {
  const [performanceId, taxCode] = key.split(SEP)
  return { performanceId: performanceId!, taxCode: taxCode ?? null }
}

/** Lines with their performance replaced by a key of it and the code of each line's ticket type. */
export async function codedLines<L extends { id: string, performance_id: string }>(lines: L[]): Promise<L[]> {
  if (!lines.length) return lines
  const codes = new Map((await all<{ id: string, code: string }>(
    `SELECT l.id, coalesce(t.tax_code, ?) AS code FROM box_office_order_lines l JOIN box_office_ticket_types t ON t.id = l.ticket_type_id
      WHERE l.id IN (SELECT value FROM json_each(?))`, await defaultTaxCode(), JSON.stringify(lines.map(l => l.id)))).map(r => [r.id, r.code]))
  const usual = await defaultTaxCode()
  return lines.map(l => ({ ...l, performance_id: coded(l.performance_id, codes.get(l.id) ?? usual) }))
}
