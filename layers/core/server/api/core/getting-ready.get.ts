// "Get your theatre ready" (Admin's overview): each first step, whether it is done and where it is done.
import { defineRoute } from '#kit'
import { gettingReady } from '../../settings/getting-ready'

export default defineRoute({ ability: 'core.settings.manage', rateLimit: 'default' }, async () => {
  return { items: await gettingReady() }
})
