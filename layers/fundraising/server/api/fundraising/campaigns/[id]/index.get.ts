// C6 Campaign: its details, settings and progress, and whether the viewer may see its gifts.
import { getRouterParam } from 'h3'
import { can, defineRoute } from '#kit'
import { requireCampaign } from '../../../../campaigns'

export default defineRoute({ ability: 'fundraising.campaign.manage', rateLimit: 'default' }, async (event, { actor }) => ({
  campaign: await requireCampaign(getRouterParam(event, 'id')!),
  canViewGifts: (await can(actor, 'fundraising.donation.view')).allowed,
}))
