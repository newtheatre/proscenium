// Money on the money screens. Amounts are kept in the currency's minor unit (pence) and shown in its
// major unit (pounds); FieldMoney is the control that types one. Dates and times come from useDates.
// Payments' screens use this too, since Payments requires Finance.
export async function useMoney() {
  const { t } = useT()
  const { data: settings } = await usePublicSettings()
  const currency = computed(() => (settings.value?.['core.locale.currency']?.value as string | undefined) ?? 'GBP')

  const digits = (code: string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2
  const scale = (code: string) => 10 ** digits(code)

  /** £12.50 from 1250. */
  function money(minor: number, code = currency.value): string {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: code }).format(minor / scale(code))
  }
  /** A signed amount for a ledger column: credits show with a minus. */
  function signed(minor: number, code = currency.value): string {
    return minor > 0 ? `+${money(minor, code)}` : money(minor, code)
  }
  const toMinor = (major: number, code = currency.value) => Math.round(major * scale(code))
  const toMajor = (minor: number, code = currency.value) => minor / scale(code)

  /** "4 minutes", "3 hours", "2 days": how long something has waited. */
  function waited(ms: number): string {
    const minutes = Math.max(1, Math.round(ms / 60_000))
    if (minutes < 60) return t('finance.waited.minutes', { count: minutes })
    const hours = Math.round(minutes / 60)
    if (hours < 48) return t('finance.waited.hours', { count: hours })
    return t('finance.waited.days', { count: Math.round(hours / 24) })
  }

  return { currency, money, signed, toMinor, toMajor, waited }
}
