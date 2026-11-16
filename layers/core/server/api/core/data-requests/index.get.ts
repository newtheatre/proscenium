// The staff queue of data requests (ID-35): every request not yet closed, with its state, its
// respond-by date and any hold codes, oldest deadline first.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { dataRequestQueue } from '../../../identity/data-requests'

export default defineRoute({ ability: 'core.data-request.manage', rateLimit: 'default', input: z.object({}) }, async () => {
  return { requests: await dataRequestQueue() }
})
