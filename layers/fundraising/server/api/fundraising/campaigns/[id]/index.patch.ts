// Changes a campaign, or moves it on: publish, close, reopen, archive or restore (FR-10).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { campaignFields, moveCampaign, requireCampaign, updateCampaign } from '../../../../campaigns'

const change = z.union([campaignFields, z.object({ step: z.enum(['publish', 'close', 'reopen', 'archive', 'restore']) }).strict()])

export default defineRoute({ ability: 'fundraising.campaign.manage', rateLimit: 'write', input: change }, async (event, { input, unit }) => {
  const campaign = await requireCampaign(getRouterParam(event, 'id')!)
  if ('step' in input) moveCampaign(unit.view(), campaign, input.step)
  else await updateCampaign(unit.view(), campaign, input)
  return { campaignId: campaign.id }
})
