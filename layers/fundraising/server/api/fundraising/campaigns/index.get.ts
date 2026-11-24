// C5 Campaigns: every campaign, open first, with raised against target, and the funds a campaign may use.
import { all, defineRoute } from '#kit'
import { listCampaigns } from '../../../campaigns'

export default defineRoute({ ability: 'fundraising.campaign.manage', rateLimit: 'default' }, async () => ({
  campaigns: await listCampaigns(),
  funds: await all<{ id: string, name: string }>("SELECT id, name FROM fundraising_funds WHERE state = 'active' ORDER BY is_default DESC, sort, name"),
}))
