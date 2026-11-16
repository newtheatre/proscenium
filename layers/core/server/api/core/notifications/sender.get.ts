// The sender screen's state (C-32, C-52): the sending domain, whether it is verified, and what
// setting it up automatically would do here. Never the token, only whether one is set.
import { z } from 'zod'
import { defineRoute, useSetting } from '#kit'
import { automaticPlan } from '../../../notifications/automatic'

export default defineRoute({ ability: 'core.sender.manage', rateLimit: 'default', input: z.object({}) }, async (event) => {
  const domain = await useSetting('core.notifications.sending-domain') as string | null
  const verified = await useSetting('core.notifications.verified-domain') as string | null
  const contact = await useSetting('core.organisation.contact-email') as string | null
  const plan = await automaticPlan(event)
  return {
    domain,
    verified: !!domain && domain === verified,
    contactSet: !!contact,
    automatic: { proposed: plan.proposed, unavailable: plan.unavailable },
  }
})
