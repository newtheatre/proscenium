// Money held in minor units, as text in the theatre's language: `money(1250, 'GBP')` is "£12.50". For a
// figure whose unit may or may not be a currency, `isCurrency(unit)` says which. Finance's useMoney adds the site's currency.
const CURRENCY = /^[A-Z]{3}$/ // not-policy: the shape of an ISO 4217 code

export function useMoneyText() {
  const { language } = useDates()
  function money(minor: number, currency: string, options: Intl.NumberFormatOptions = {}): string {
    const digits = new Intl.NumberFormat(language.value, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
    return new Intl.NumberFormat(language.value, { style: 'currency', currency, ...options }).format(minor / 10 ** digits)
  }
  return { money, isCurrency: (unit: string | undefined): unit is string => !!unit && CURRENCY.test(unit) }
}
