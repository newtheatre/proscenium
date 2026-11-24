// An agreement version's terms in a line or two, as staff and the company read them (part 5).
import type { AgreementVersion } from '../../shared/views'

export function useAgreementWords() {
  const { t } = useT()
  const { money } = useMoneyText()
  const STATE_TONES = { draft: 'neutral', sent: 'info', accepted: 'success', declined: 'danger', superseded: 'neutral', withdrawn: 'neutral' } as const
  function deal(v: AgreementVersion, currency: string): string {
    const share = v.companyShareBp !== null ? t('companies.agreements.words.share', { percent: v.companyShareBp / 100, basis: t(`companies.agreements.basis.${v.shareBasis ?? 'gross'}`) }) : ''
    const guarantee = v.guaranteeMinor !== null ? money(v.guaranteeMinor, currency) : ''
    switch (v.dealType) {
      case 'split': return share
      case 'guarantee': return t('companies.agreements.words.guarantee', { amount: guarantee })
      case 'guarantee-or-split': return t('companies.agreements.words.guarantee-or-split', { amount: guarantee, share })
      case 'hire': return v.hireFeeMinor !== null ? t(`companies.agreements.words.hire.${v.hireFeeBasis ?? 'flat'}`, { amount: money(v.hireFeeMinor, currency) }) : ''
      default: return t('companies.agreements.words.none')
    }
  }
  return {
    deal,
    stateBadge: (v: AgreementVersion) => ({ label: t(`companies.agreements.states.${v.state}`), tone: STATE_TONES[v.state] }),
    extras(v: AgreementVersion, currency: string): string {
      return [
        v.guestPlaces ? t('companies.agreements.words.guests', { count: v.guestPlaces }) : null,
        v.depositMinor ? t('companies.agreements.words.deposit', { amount: money(v.depositMinor, currency) }) : null,
      ].filter(Boolean).join(' · ')
    },
  }
}
