// "From £6 · Member £4": a production's price as one line for the public pages. Whole amounts drop
// their pence, so a listing reads "£6" rather than "£6.00". One open price reads as itself ("£12"),
// and a show whose every price is nothing reads "Free", never "From £0".
export interface PriceSummaryView { currency: string, fromMinor: number | null, toMinor?: number | null, others: { label: string, amountMinor: number }[] }

export function priceSummary(price: PriceSummaryView, t: ReturnType<typeof useT>['t']): string {
  const digits = new Intl.NumberFormat('en-GB', { style: 'currency', currency: price.currency }).resolvedOptions().maximumFractionDigits ?? 2
  const scale = 10 ** digits
  const amount = (minor: number) => minor === 0
    ? t('public-site.price.free-amount')
    : new Intl.NumberFormat('en-GB', { style: 'currency', currency: price.currency, minimumFractionDigits: minor % scale ? digits : 0 }).format(minor / scale)
  const { fromMinor, toMinor } = price
  if (fromMinor === 0 && !toMinor && price.others.every(o => o.amountMinor === 0)) return t('public-site.price.free')
  const from = fromMinor === null
    ? []
    : [toMinor !== undefined && toMinor !== null && toMinor === fromMinor ? amount(fromMinor) : t('public-site.price.from', { amount: amount(fromMinor) })]
  return [
    ...from,
    ...price.others.map(o => t('public-site.price.other', { label: o.label, amount: amount(o.amountMinor) })),
  ].join(' · ')
}
