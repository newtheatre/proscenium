// How a figure or a report line from another module reads (front-of-house.tonight-figure and
// front-of-house.report-section): a label is translated when the catalogue has it and shown as given
// otherwise (a till's name), and a value whose unit is a currency code is money in minor units.
const CURRENCY = /^[A-Z]{3}$/ // not-policy: the shape of an ISO 4217 code

export function useFigureValue() {
  const { t, te } = useT()
  const label = (text: string) => (te(text) ? t(text) : text)
  function value(v: string | number | null, unit?: string): string {
    if (v === null) return t('front-of-house.figure.unavailable')
    if (typeof v === 'number' && unit && CURRENCY.test(unit)) {
      const format = new Intl.NumberFormat('en-GB', { style: 'currency', currency: unit })
      return format.format(v / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2))
    }
    return unit ? `${v} ${unit}` : String(v)
  }
  return { label, value }
}
