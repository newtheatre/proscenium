// The public Support pages (P1, P2; FR-09, FR-11, rule K3): open campaigns and offered funds, and a
// campaign's own page with its progress and the names of donors who chose to be named. Drafts and
// archived campaigns are not public.
import { all, refuse, useSetting } from '#kit'
import { getCampaign, RAISED, type Campaign } from './campaigns'
import { offeredFunds, type OfferedFund } from './giving'

export interface Progress { raisedMinor: number, targetMinor: number | null, currency: string }
export interface Band { fromMinor: number, toMinor: number | null }
export interface Named { name: string, amountMinor: number | null, band: Band | null }
export interface PublicCampaign {
  slug: string
  title: string
  summary: string
  body: string | null
  state: 'open' | 'closed'
  currency: string
  fund: { id: string, name: string }
  progress: Progress | null
  names: Named[] | null
  listAmounts: Campaign['listAmounts']
}

const NAMES = 200 // not-policy: one page of names, newest first

/** K3: the band a gift falls in; each runs to the next edge less a penny, the last has no top. */
export function bandOf(amountMinor: number, edges: number[]): Band | null {
  const rising = [...edges].sort((a, b) => a - b)
  const at = rising.findLastIndex(edge => edge <= amountMinor)
  if (at < 0) return null
  const next = rising[at + 1]
  return { fromMinor: rising[at]!, toMinor: next === undefined ? null : next - 1 }
}

async function namesFor(campaign: Campaign): Promise<Named[]> {
  const rows = await all<{ name: string, amountMinor: number, showAmount: number | null }>(
    `SELECT acknowledge_as AS name, amount_minor - refunded_minor AS amountMinor, show_amount AS showAmount FROM fundraising_donations
      WHERE campaign_id = ? AND state = 'received' AND acknowledge_as IS NOT NULL
      ORDER BY received_on DESC, created_at DESC, rowid DESC LIMIT ${NAMES}`, campaign.id)
  const edges = await useSetting('fundraising.acknowledgement.bands') as number[]
  return rows.map(r => ({
    name: r.name,
    amountMinor: campaign.listAmounts === 'exact' && r.showAmount ? r.amountMinor : null,
    band: campaign.listAmounts === 'band' && r.showAmount ? bandOf(r.amountMinor, edges) : null,
  }))
}

/** P2: a campaign's page, open or closed. A closed one still says where to give instead. */
export async function publicCampaign(slug: string): Promise<PublicCampaign> {
  const c = await getCampaign({ slug })
  if (!c || (c.state !== 'open' && c.state !== 'closed')) refuse('core.not-found', 'There is no campaign at this address.', { status: 404 })
  return {
    slug: c!.slug,
    title: c!.title,
    summary: c!.summary,
    body: c!.body,
    state: c!.state as 'open' | 'closed',
    currency: c!.currency,
    fund: { id: c!.fundId, name: c!.fund },
    progress: c!.showTotal ? { raisedMinor: c!.raisedMinor, targetMinor: c!.targetMinor, currency: c!.currency } : null,
    names: c!.listNames ? await namesFor(c!) : null,
    listAmounts: c!.listAmounts,
  }
}

export interface SupportPage {
  campaigns: { slug: string, title: string, summary: string, progress: Progress | null }[]
  funds: OfferedFund[]
}

/** P1: the open campaigns and the funds a donor may choose. Sponsors join with their slice. */
export async function supportPage(): Promise<SupportPage> {
  const campaigns = await all<{ slug: string, title: string, summary: string, showTotal: number, raisedMinor: number, targetMinor: number | null, currency: string }>(
    `SELECT c.slug, c.title, c.summary, c.show_total AS showTotal, ${RAISED} AS raisedMinor, c.target_minor AS targetMinor, c.currency
      FROM fundraising_campaigns c WHERE c.state = 'open' ORDER BY c.opens_at DESC`)
  return {
    campaigns: campaigns.map(({ showTotal, raisedMinor, targetMinor, currency, ...c }) => ({ ...c, progress: showTotal ? { raisedMinor, targetMinor, currency } : null })),
    funds: await offeredFunds(),
  }
}
