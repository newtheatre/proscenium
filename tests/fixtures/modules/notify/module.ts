// A second test fixture: listens to seats.sold, so events cross a module boundary, and sends an
// email through core's notifyAddress from its own job.
import { z } from 'zod'
import { defineModule, job } from '#kit'
import { tables } from './server/db/schema'

export default defineModule({
  id: 'notify',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  uses: ['seats'],
  tables,
  events: { listens: { 'seats.performance.sold': 'on-sold' } },
  jobs: {
    'notify.send-ticket': job({ payload: z.object({ address: z.string(), link: z.string(), key: z.string().optional() }), retries: 3 }),
  },
  contributes: {
    'core.notification-type': [{
      id: 'notify.ticket-ready',
      category: 'transactional',
      side: 'audience',
      channels: ['email'],
      lane: 'prompt',
      variables: { link: 'url', seat: 'text' },
      wording: { 'en-GB': { subject: 'Your ticket for {{ theatre }}', body: 'Your seat is **{{ seat }}**.\n\n[Open your ticket]({{ link }})\n\nSee you soon.' } },
    }],
  },
})
