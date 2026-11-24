// How a gift reads in the console: its name, its line and its state's badge.
export interface DonationLine { id: string, reference: string | null, donor: string | null, amountMinor: number, refundedMinor: number, currency: string, fund: string, channel: string, state: string, receivedOn: string | null, giftAid: string }

const TONES: Record<string, 'success' | 'neutral' | 'warning' | 'danger'> = { pending: 'warning', received: 'success', abandoned: 'neutral', refunded: 'danger' }

export function useDonationText() {
  const { t } = useT()
  const { money } = useMoneyText()
  const { day } = useDates()
  return {
    money,
    name: (d: DonationLine) => d.donor ? t('fundraising.donations.named', { reference: d.reference ?? '', donor: d.donor }) : (d.reference ?? t('fundraising.donations.untitled')),
    line: (d: DonationLine) => [
      money(d.amountMinor, d.currency),
      d.refundedMinor ? t('fundraising.donations.refunded-part', { amount: money(d.refundedMinor, d.currency) }) : null,
      d.fund,
      t(`fundraising.channels.${d.channel}`),
      d.receivedOn ? day(d.receivedOn) : null,
    ].filter(Boolean).join(' · '),
    state: (d: { state: string }) => ({ tone: TONES[d.state] ?? 'neutral', label: t(`fundraising.states.${d.state}`) }),
  }
}
