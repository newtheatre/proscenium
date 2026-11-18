// Calculated values as people read them: named by their label, money in the theatre's currency and
// a share as a percentage (shared/figures.ts).
import type { Calculation } from '../../shared/engine'
import { figureName, figureText, type Figure } from '../../shared/figures'

export function useFormsFigures() {
  const { data: settings } = usePublicSettings()
  const { language, day } = useDates()
  const currency = computed(() => (settings.value?.['core.locale.currency']?.value as string | undefined) ?? 'GBP')
  const figure = (c: Pick<Calculation, 'type'>, value: Figure): string => figureText(c.type, value, { locale: language.value, currency: currency.value, day })
  return { figure, figureName }
}
