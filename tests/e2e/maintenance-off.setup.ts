// Before any browser test: a new site starts in maintenance mode (closed to the public until its
// Owner opens it), but the browser tests' site never has an Owner, so switch maintenance mode off
// here, as the Owner would after setup. The other tests depend on this one (playwright.config.ts).
import { test as setup, expect } from '@playwright/test'

setup('switch maintenance mode off', async ({ playwright }) => {
  const actor = { kind: 'person', accountId: 'acc_e2eowner', name: 'Browser Tests', assurance: 'strong', reassertedAt: Date.now(), grants: [{ ability: 'core.modules.manage', via: 'test' }] }
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
  const response = await api.put('/api/core/modules/maintenance', { data: { on: false } })
  expect(response.status(), await response.text()).toBe(200)
  await api.dispose()
})
