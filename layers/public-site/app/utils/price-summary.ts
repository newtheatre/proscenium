// "From £6 · Member £4": a production's price as one line for the public pages. Whole amounts drop
// their pence, so a listing reads "£6" rather than "£6.00".
export interface PriceSummaryView { currency: string, fromMinor: number | null, others: { label: string, amountMinor: number }[] }

export function priceSummary(price: PriceSummaryView, t: ReturnType<typeof useT>['t']): string {
  const digits = new Intl.NumberFormat('en-GB', { style: 'currency', currency: price.currency }).resolvedOptions().maximumFractionDigits ?? 2
  const scale = 10 ** digits
  const amount = (minor: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: price.currency, minimumFractionDigits: minor % scale ? digits : 0 }).format(minor / scale)
  return [
    ...(price.fromMinor === null ? [] : [t('public-site.price.from', { amount: amount(price.fromMinor) })]),
    ...price.others.map(o => t('public-site.price.other', { label: o.label, amount: amount(o.amountMinor) })),
  ].join(' · ')
}
