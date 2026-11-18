// A setting that declares whenModule is left out of the settings screens while that module is off.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import settingsGet from '../../../core/server/api/core/settings/index.get'
import { call, person, server, setModule } from '../../../../tests/integration/helpers'

const handle = server({ 'GET /api/core/settings': settingsGet })
const admin = person(['membership.settings.manage', 'core.settings.manage'])
const keys = async () => {
  const response = await call(handle, 'GET', '/api/core/settings?module=membership', { actor: admin })
  return ((await response.json()) as { settings: { key: string }[] }).settings.map(s => s.key)
}

beforeAll(() => setModule('membership', true))
afterAll(() => setModule('membership-fees', false))

describe('a setting that applies only while another module is on', () => {
  it('is shown with Membership fees on and hidden with it off', async () => {
    await setModule('membership-fees', true)
    expect(await keys()).toContain('membership.applications.expire-after')
    await setModule('membership-fees', false)
    const off = await keys()
    expect(off).not.toContain('membership.applications.expire-after')
    expect(off).toContain('membership.renewal.grace')
  })
})
