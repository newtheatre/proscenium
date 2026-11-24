// Words shared by the invoice screens: an invoice's badge, overdue beside it, and money.
export type InvoiceShown = 'draft' | 'issued' | 'part-paid' | 'paid' | 'credited' | 'written-off' | 'credit-note' | 'to-give-back'
type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export function useInvoiceText() {
  const { t } = useT()
  const { money } = useMoneyText()
  const TONES: Record<InvoiceShown, Tone> = { 'draft': 'neutral', 'issued': 'info', 'part-paid': 'warning', 'paid': 'success', 'credited': 'neutral', 'written-off': 'neutral', 'credit-note': 'neutral', 'to-give-back': 'warning' }
  const state = (shown: InvoiceShown) => ({ tone: TONES[shown], label: t(`invoicing.screens.invoices.states.${shown}`) })
  /** "Overdue by 3 days", or null while not overdue. */
  const overdue = (days: number) => days > 0 ? t('invoicing.screens.invoices.overdue', { n: days }) : null
  return { state, overdue, money }
}
