// NNT: a show's price in one phrase, "From £6": the lowest price anybody can pay, members and
// concessions included. Upstream's priceSummary lists every price; the cards and the show page's
// facts want just this.
export function fromPrice(price: PriceSummaryView | null | undefined, t: ReturnType<typeof useT>['t']): string {
  if (!price) return ''
  const all = [price.fromMinor, ...price.others.map(o => o.amountMinor)].filter((n): n is number => typeof n === 'number')
  if (!all.length) return ''
  const lowest = Math.min(...all)
  if (lowest === 0 && all.every(n => n === 0)) return t('public-site.price.free')
  const digits = new Intl.NumberFormat('en-GB', { style: 'currency', currency: price.currency }).resolvedOptions().maximumFractionDigits ?? 2
  const scale = 10 ** digits
  const amount = lowest === 0
    ? t('public-site.price.free-amount')
    : new Intl.NumberFormat('en-GB', { style: 'currency', currency: price.currency, minimumFractionDigits: lowest % scale ? digits : 0 }).format(lowest / scale)
  return all.every(n => n === lowest) ? amount : t('public-site.price.from', { amount })
}
