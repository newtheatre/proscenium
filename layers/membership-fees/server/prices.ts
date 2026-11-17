// Prices (tab 2, membership_fees_prices; rule P1). The price in force for a membership is the latest
// from_date not after the day, among those for its kind (`join` or `renew`, or both); a price for the
// length chosen wins over one for every length.
import { all, first } from '#kit'
import type { ChargeKind, ChargeQuote } from '#modules/membership'

export interface PriceRow { id: string, lengthOptionId: string | null, amountMinor: number, currency: string, taxCode: string, appliesTo: string, fromDate: string, createdAt: number }

const SELECT = 'SELECT id, length_option_id AS lengthOptionId, amount_minor AS amountMinor, currency, tax_code AS taxCode, applies_to AS appliesTo, from_date AS fromDate, created_at AS createdAt FROM membership_fees_prices'

export async function priceInForce(schemeId: string, lengthOptionId: string | null, kind: ChargeKind, on: string): Promise<(ChargeQuote & { taxCode: string }) | null> {
  const row = await first<PriceRow>(
    `${SELECT} WHERE scheme_id = ?1 AND from_date <= ?2 AND applies_to IN ('join-and-renew', ?3) AND (length_option_id IS NULL OR length_option_id = ?4) ORDER BY length_option_id IS NULL, from_date DESC, applies_to = 'join-and-renew', created_at DESC LIMIT 1`,
    schemeId, on, kind, lengthOptionId,
  )
  return row ? { priceId: row.id, amountMinor: row.amountMinor, currency: row.currency, taxCode: row.taxCode } : null
}

/** Every price a scheme has had, newest first: the history the Fees page shows. */
export function pricesOf(schemeId: string): Promise<PriceRow[]> {
  return all<PriceRow>(`${SELECT} WHERE scheme_id = ? ORDER BY from_date DESC, created_at DESC`, schemeId)
}
