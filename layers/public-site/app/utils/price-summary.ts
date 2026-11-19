// "From £4": a production's price as one short line for the public pages, the lowest anyone pays,
// shown beside the Book button (Matt, 19 November). A price held by an account (a membership, a
// fellowship) is left out, so a free Fellow ticket never makes a show read "From free" (Matt, 19
// November). Whole amounts drop their pence, so a listing reads "£6" rather than "£6.00". One price for everyone reads as itself ("£12"), and a show whose
// every price is nothing reads "Free", never "From £0".
export interface PriceSummaryView { currency: string, fromMinor: number | null, toMinor?: number | null, others: { label: string, amountMinor: number, gated?: boolean }[] }

export function priceSummary(price: PriceSummaryView, t: ReturnType<typeof useT>['t']): string {
  const digits = new Intl.NumberFormat('en-GB', { style: 'currency', currency: price.currency }).resolvedOptions().maximumFractionDigits ?? 2
  const scale = 10 ** digits
  const amount = (minor: number) => minor === 0
    ? t('public-site.price.free-amount')
    : new Intl.NumberFormat('en-GB', { style: 'currency', currency: price.currency, minimumFractionDigits: minor % scale ? digits : 0 }).format(minor / scale)
  const amounts = [...(price.fromMinor === null ? [] : [price.fromMinor, price.toMinor ?? price.fromMinor]), ...price.others.filter(o => !o.gated).map(o => o.amountMinor)]
  if (!amounts.length) return ''
  if (amounts.every(a => a === 0)) return t('public-site.price.free')
  const lowest = Math.min(...amounts)
  // One price for everyone reads as itself; otherwise the lowest anyone pays (Matt, 19 November).
  return amounts.every(a => a === lowest) ? amount(lowest) : t('public-site.price.from', { amount: amount(lowest) })
}
