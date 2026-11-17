// Identity's settings as part 6 declares them: the ones a slip would weaken ask again, and arming
// the account sweeps is an Owner's alone and asks why.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useRegistry } from '#kit/registry'
import { clearSetting, grantDirectly, leaveIdentity, reset, staff, useIdentity } from './helpers'
import { inContext } from '../../../../../tests/integration/helpers'

beforeAll(useIdentity)
afterAll(leaveIdentity)
beforeEach(reset)

describe('identity settings', () => {
  it('asks again before a setting that weakens sign-in or a retention period changes', async () => {
    const confirmed = await inContext(async () => [...useRegistry().settings].filter(([, s]) => s.entry.onChange === 'confirm').map(([k]) => k))
    for (const key of ['core.sign-in.email-link', 'core.sign-in.google', 'core.sign-in.google-domains', 'core.sign-in.managed-domains', 'core.sign-in.provider-is-strong', 'core.grants.allow-no-expiry', 'core.retention.unclaimed-after', 'core.retention.dormant-after', 'core.emergency-contacts.keep-after-standing', 'core.access-scheme.keep-rejected', 'core.merge.undo-window', 'core.privacy.export-lifetime'])
      expect(confirmed).toContain(key)
    expect(confirmed).not.toContain('core.retention.run-cap')
  })

  it('lets only a holder of core.retention.arm arm the sweeps, and only with a reason', async () => {
    await clearSetting('core.retention.armed')
    const admin = await staff()
    await grantDirectly(admin.accountId, ['core.identity-settings.manage'])
    expect((await admin.browser.put('/api/core/settings/core.retention.armed', { value: true, reason: 'Agreed at the board' })).status).toBe(403)

    const owner = await staff()
    await grantDirectly(owner.accountId, ['core.retention.arm'])
    expect((await owner.browser.put('/api/core/settings/core.retention.armed', { value: true })).status).toBe(422)
    expect((await owner.browser.put('/api/core/settings/core.retention.armed', { value: true, reason: 'Agreed at the board' })).status).toBe(200)
    await clearSetting('core.retention.armed')
  })
})
