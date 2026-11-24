// Pauses or resumes a webhook (C-51). Resuming sends what waited meanwhile.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { setWebhookPaused } from '../../../../webhooks/service'

export default defineRoute({ ability: 'core.webhook.manage', rateLimit: 'write', input: z.object({ paused: z.boolean() }) }, async (event, { input, unit }) => {
  await setWebhookPaused(unit, getRouterParam(event, 'id', { decode: true }) ?? '', input.paused)
  return { ok: true }
})
