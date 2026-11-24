// A figure's value as text in the theatre's language: money from minor units, a percentage to one
// decimal place, minutes as hours and minutes. Money in two currencies is shown side by side (M7).
import type { FigureColumn } from '../../shared/reports'
import type { Amount, Shown } from '../../shared/table'

export function useFigureText() {
  const { t } = useT()
  const { money } = useMoneyText()
  const { language } = useDates()
  const { data: settings } = usePublicSettings()
  const currency = computed(() => (settings.value?.['core.locale.currency']?.value as string | undefined) ?? 'GBP')
  const count = (value: number) => new Intl.NumberFormat(language.value).format(value)

  function one(unit: FigureColumn['unit'], amount: Amount): string {
    if (unit === 'money') return money(amount.value, amount.currency ?? currency.value)
    if (unit === 'percent') return `${new Intl.NumberFormat(language.value, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(amount.value)}%`
    if (unit === 'minutes') return t('reports.units.hours-minutes', { hours: Math.floor(amount.value / 60), minutes: amount.value % 60 }) // not-policy: minutes in an hour
    return count(amount.value)
  }

  /** The text of a cell: a dash when the figure could not answer, with the reason for a tooltip. */
  function text(unit: FigureColumn['unit'], shown: Shown | undefined): { text: string, reason?: string } {
    if (!shown) return { text: '–' }
    if (shown.state === 'unsupported') return { text: '–', reason: t('reports.unavailable.unsupported') }
    if (shown.state === 'unavailable') return { text: '–', reason: t(`reports.unavailable.${shown.reason}`) }
    if (!shown.amounts.length) return { text: unit === 'money' ? money(0, currency.value) : one(unit, { value: 0 }) }
    return { text: shown.amounts.map(a => one(unit, a)).join(' · ') }
  }

  return { text }
}
