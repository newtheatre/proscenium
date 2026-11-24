// How a campaign reads in the console and on its page: its state as a badge, and raised against
// target in the theatre's money.
export interface CampaignLine { id: string, slug: string, title: string, state: 'draft' | 'open' | 'closed' | 'archived', targetMinor: number | null, raisedMinor: number, currency: string, opensAt: number, closesAt: number | null, publishedAt: number | null, fund: string }
export interface Campaign extends CampaignLine {
  summary: string
  body: string | null
  fundId: string
  productionId: string | null
  offsetMinor: number
  offsetNote: string | null
  showTotal: boolean
  countGiftAid: boolean
  listNames: boolean
  listAmounts: 'none' | 'band' | 'exact'
  targetReachedAt: number | null
  received: boolean
}
type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export function useCampaignText() {
  const { t } = useT()
  const { money } = useMoneyText()
  const { dateTime } = useDates()
  const TONES: Record<CampaignLine['state'], Tone> = { draft: 'neutral', open: 'success', closed: 'info', archived: 'neutral' }
  return {
    state: (c: CampaignLine) => ({
      tone: TONES[c.state],
      label: c.state === 'draft' && c.publishedAt ? t('fundraising.campaign.states.scheduled') : t(`fundraising.campaign.states.${c.state}`),
    }),
    raised: (c: Pick<CampaignLine, 'raisedMinor' | 'targetMinor' | 'currency'>) => c.targetMinor
      ? t('fundraising.campaign.raised-of', { raised: money(c.raisedMinor, c.currency), target: money(c.targetMinor, c.currency) })
      : t('fundraising.campaign.raised', { raised: money(c.raisedMinor, c.currency) }),
    percent: (c: Pick<CampaignLine, 'raisedMinor' | 'targetMinor'>) => c.targetMinor ? Math.min(100, Math.round(c.raisedMinor * 100 / c.targetMinor)) : null, // not-policy: a percentage
    dates: (c: CampaignLine) => c.closesAt
      ? t('fundraising.campaign.runs', { from: dateTime(c.opensAt), to: dateTime(c.closesAt) })
      : t('fundraising.campaign.from', { from: dateTime(c.opensAt) }),
  }
}
