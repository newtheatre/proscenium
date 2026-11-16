// The interface's server seam: who may open an address (guard order), what navigation each viewer
// is shown, who counts as a member or as console staff, and the generated settings endpoints.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import access from '../../server/api/core/access.get'
import navigation from '../../server/api/core/navigation.get'
import viewer from '../../server/api/core/viewer.get'
import settingsGet from '../../server/api/core/settings/index.get'
import settingsPut from '../../server/api/core/settings/index.put'
import { resetRateLimits } from '#kit/ratelimit'
import { call, person, server, setModule } from '../../../../tests/integration/helpers'

const handle = server({
  'GET /api/core/access': access,
  'GET /api/core/navigation': navigation,
  'GET /api/core/viewer': viewer,
  'GET /api/core/settings': settingsGet,
  'PUT /api/core/settings': settingsPut,
})

const staff = () => person(['gallery.sample.view', 'gallery.sample.manage'])
const reader = () => person(['gallery.sample.view'])
const audience = () => person([])

beforeAll(() => setModule('gallery', true))
afterAll(() => setModule('gallery', false))
afterEach(() => resetRateLimits())

const decide = async (path: string, actor?: ReturnType<typeof person>) => (await (await call(handle, 'GET', `/api/core/access?path=${encodeURIComponent(path)}`, { actor })).json()) as { decision: string, refusal?: { code: string, remedy?: string } }

describe('the guard for addresses under a shell (UI-07, UI-08)', () => {
  it('lets anyone open a page outside the shells', async () => {
    expect((await decide('/whats-on')).decision).toBe('allow')
  })

  it('sends a signed-out visitor to sign in', async () => {
    expect((await decide('/console/gallery/list')).decision).toBe('sign-in')
    expect((await decide('/account')).decision).toBe('sign-in')
  })

  it('tells someone with no business in the console that the page does not exist', async () => {
    expect((await decide('/console/gallery/list', audience())).decision).toBe('not-found')
    expect((await decide('/console', audience())).decision).toBe('not-found')
  })

  it('tells someone in the console who lacks the ability why, and what would let them through', async () => {
    const result = await decide('/console/gallery/denied', reader())
    expect(result.decision).toBe('refused')
    expect(result.refusal?.code).toBe('core.access.denied')
    expect(result.refusal?.remedy).toBeTruthy()
  })

  it('treats an address no entry covers as not found, even for staff', async () => {
    expect((await decide('/console/gallery/nothing-here', staff())).decision).toBe('not-found')
  })

  it('lets staff open the screens they hold the ability for, and the console home', async () => {
    expect((await decide('/console/gallery/form', staff())).decision).toBe('allow')
    expect((await decide('/console', reader())).decision).toBe('allow')
  })

  it('lets any signed-in person open their account', async () => {
    expect((await decide('/account/gallery', audience())).decision).toBe('allow')
  })
})

describe('navigation and the viewer', () => {
  it('shows each person only the entries they may open, with the groups in the fixed order', async () => {
    const body = await (await call(handle, 'GET', '/api/core/navigation?shell=console', { actor: staff() })).json() as { groups: { id: string, everyday: { id: string }[], setup: { id: string }[] }[] }
    const ids = body.groups.map(g => g.id)
    expect(ids).toContain('gallery')
    expect(ids).not.toContain('system') // nothing of core's is theirs to open
    const gallery = body.groups.find(g => g.id === 'gallery')!
    expect(gallery.everyday.map(e => e.id)).toEqual(['gallery.list', 'gallery.form', 'gallery.feedback'])
    expect(gallery.setup.map(e => e.id)).toEqual(['gallery.steps', 'gallery.settings']) // its settings page sits in its own group
    expect(gallery.setup.map(e => e.id)).not.toContain('gallery.denied')
  })

  it('answers a shell the viewer has no business in exactly as a missing page', async () => {
    expect((await call(handle, 'GET', '/api/core/navigation?shell=console', { actor: audience() })).status).toBe(404)
    expect((await call(handle, 'GET', '/api/core/navigation?shell=console')).status).toBe(404)
  })

  it('leaves out an entry the viewer may not open, and with it its group', async () => {
    const body = await (await call(handle, 'GET', '/api/core/navigation?shell=console', { actor: person(['gallery.sample.view']) })).json() as { groups: { id: string, setup: { id: string }[] }[] }
    expect(body.groups.find(g => g.id === 'gallery')?.setup.map(e => e.id)).toEqual(['gallery.steps'])
    expect(body.groups.map(g => g.id)).not.toContain('system')
  })

  it('describes a signed-out visitor, an audience account and console staff', async () => {
    const out = await (await call(handle, 'GET', '/api/core/viewer')).json() as { signedIn: boolean, sides: string[] }
    expect(out).toMatchObject({ signedIn: false, sides: ['audience'] })
    const aud = await (await call(handle, 'GET', '/api/core/viewer', { actor: audience() })).json() as { signedIn: boolean, sides: string[] }
    expect(aud).toMatchObject({ signedIn: true, sides: ['audience'] })
    const sam = await (await call(handle, 'GET', '/api/core/viewer', { actor: staff() })).json() as { sides: string[] }
    expect(sam.sides).toEqual(['audience', 'console'])
  })
})

describe('the generated settings page (UI-14)', () => {
  it('shows who may change each setting and refuses someone who may not see the page', async () => {
    const ok = await call(handle, 'GET', '/api/core/settings?module=gallery', { actor: staff() })
    expect(ok.status).toBe(200)
    expect(await call(handle, 'GET', '/api/core/settings?module=gallery', { actor: audience() }).then(r => r.status)).toBe(404)
    expect(await call(handle, 'GET', '/api/core/settings?module=nothing', { actor: staff() }).then(r => r.status)).toBe(404)
  })

  it('saves a section in one go and records it, or changes nothing when one value is refused', async () => {
    const actor = staff()
    const saved = await call(handle, 'PUT', '/api/core/settings', { actor, body: { changes: [{ key: 'gallery.demo.title', value: 'Macbeth' }, { key: 'gallery.demo.limit', value: 4 }] } })
    expect(saved.status).toBe(200)
    const refused = await call(handle, 'PUT', '/api/core/settings', { actor, body: { changes: [{ key: 'gallery.demo.title', value: 'Othello' }, { key: 'gallery.demo.limit', value: 99 }] } })
    expect(refused.status).toBeGreaterThanOrEqual(400)
    const now = await (await call(handle, 'GET', '/api/core/settings?module=gallery', { actor })).json() as { settings: { key: string, value: unknown }[] } | { key: string, value: unknown }[]
    const list = Array.isArray(now) ? now : now.settings
    expect(list.find(s => s.key === 'gallery.demo.title')?.value).toBe('Macbeth')
    const reset = await call(handle, 'PUT', '/api/core/settings', { actor, body: { changes: [{ key: 'gallery.demo.title', reset: true }, { key: 'gallery.demo.limit', reset: true }] } })
    expect(reset.status).toBe(200)
  })

  it('refuses a change by someone without the ability for that setting', async () => {
    const response = await call(handle, 'PUT', '/api/core/settings', { actor: reader(), body: { changes: [{ key: 'gallery.demo.title', value: 'Nope' }] } })
    expect(response.status).toBe(403)
  })
})
