// A DELETE that carries a body is answered on the built Worker. Nitro's Cloudflare entry hands on a
// body only for POST, PUT and PATCH, and a route that waited for one was cancelled as hung.
import { test, expect } from '@playwright/test'

const someone = { kind: 'person', accountId: 'acc_deleterequests', name: 'Del Request', assurance: 'strong', reassertedAt: Date.now(), grants: [] }
test.use({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(someone) } })

test('a DELETE with a body gets an answer, not a hung Worker', async ({ request }) => {
  const reply = await request.delete('/api/core/me/sessions/ses_nothing', { data: {} })
  // Whatever the route decides, it decides: a refusal with a code, never the runtime's error page.
  expect(reply.status()).toBeLessThan(500) // not-policy: HTTP's server errors
  expect((await reply.json()).code).toMatch(/^core\./)
})
