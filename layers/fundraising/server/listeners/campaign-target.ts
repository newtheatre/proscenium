// A gift to a campaign was received: the campaign may have reached its target (K2).
import { defineListener } from '#kit'
import { markTargetReached } from '../campaigns'

export default defineListener(async (event, unit) => {
  const { campaignId } = event.payload as { campaignId: string | null }
  if (campaignId) await markTargetReached(unit, campaignId)
})
