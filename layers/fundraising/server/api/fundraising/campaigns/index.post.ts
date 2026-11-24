// A new campaign, a draft until published (FR-10).
import { defineRoute } from '#kit'
import { campaignFields, createCampaign } from '../../../campaigns'

export default defineRoute({ ability: 'fundraising.campaign.manage', rateLimit: 'write', idempotent: true, input: campaignFields }, async (_event, { actor, input, unit }) => (
  { campaignId: await createCampaign(unit.view(), actor, input) }
))
