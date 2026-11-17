// The interface's server seam: who may open an address (guard order), what navigation each viewer
// is shown, who counts as a member or as console staff, and the generated settings endpoints.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import access from '../../server/api/core/access.get'
import navigation from '../../server/api/core/navigation.get'
import accountSections from '../../server/api/core/account-sections.get'
import home from '../../server/api/core/home.get'
import recordTabs from '../../server/api/core/record-tabs.get'
import history from '../../server/api/core/history.get'
import putModule from '../../server/api/core/modules/[id].put'
import viewer from '../../server/api/core/viewer.get'
import settingsGet from '../../server/api/core/settings/index.get'
import settingsPut from '../../server/api/core/settings/index.put'
import { resetRateLimits } from '#kit/ratelimit'
import { useSetting } from '#kit/settings-store'
import { call, env, inContext, person, server, setModule } from '../../../../tests/integration/helpers'

const handle = server({
  'GET /api/core/access': access,
  'GET /api/core/navigation': navigation,
  'GET /api/core/viewer': viewer,
  'PUT /api/core/modules/:id': putModule,
  'GET /api/core/home': home,
  'GET /api/core/record-tabs': recordTabs,
  'GET /api/core/history': history,
  'GET /api/core/account-sections': accountSections,
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
    expect(gallery.everyday.map(e => e.id)).toEqual(['gallery.list', 'gallery.shows', 'gallery.form', 'gallery.choices', 'gallery.record', 'gallery.feedback', 'gallery.drafts'])
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

describe("core's settings", () => {
  it('have no console page of their own: each group is on one page, mostly in Site administration', async () => {
    const organiser = person(['core.organisation.edit', 'core.settings.manage'])
    expect((await decide('/console/system/settings', organiser)).decision).toBe('not-found')
    expect((await decide('/console/core/settings', organiser)).decision).toBe('not-found')
    expect((await decide('/admin/theatre', organiser)).decision).toBe('allow')
    expect((await decide('/admin/advanced', organiser)).decision).toBe('allow')
  })

  it('carry a renamed key\'s value, and the old key still answers', async () => {
    await env.DB.prepare('INSERT INTO core_settings (key, value, updated_at) VALUES (?, ?, 0)').bind('core.notifications.max-attempts', '3').run()
    try {
      const actor = person(['core.notification.configure'])
      const page = await (await call(handle, 'GET', '/api/core/settings?page=core.advanced', { actor })).json() as { settings: { key: string, value: unknown, overridden: boolean }[] }
      expect(page.settings.find(s => s.key === 'core.delivery.max-attempts')).toMatchObject({ value: 3, overridden: true })
      expect(page.settings.map(s => s.key)).not.toContain('core.notifications.max-attempts')
      expect(await inContext(() => useSetting('core.notifications.max-attempts' as never))).toBe(3)
      // Changing it under the new name settles it: the old key's row goes.
      expect((await call(handle, 'PUT', '/api/core/settings', { actor, body: { changes: [{ key: 'core.delivery.max-attempts', value: 4 }] } })).status).toBe(200)
      expect(await env.DB.prepare('SELECT key, value FROM core_settings WHERE key LIKE ?').bind('core.%.max-attempts').all().then(r => r.results)).toEqual([{ key: 'core.delivery.max-attempts', value: '4' }])
    }
    finally {
      await env.DB.prepare('DELETE FROM core_settings WHERE key LIKE ?').bind('core.%.max-attempts').run()
    }
  })
})

describe('Site administration (R-33)', () => {
  const admin = () => person(['core.settings.manage'])
  type Settings = { page: { id: string, to: string } | null, settings: { key: string, module: string, page: string | null, screen: string | null, scope: string }[] }
  const settings = async (query: string, actor = admin()) => (await call(handle, 'GET', `/api/core/settings?${query}`, { actor }))

  it('opens to a person who holds the ability of an admin entry, and is not found for anyone else', async () => {
    expect((await decide('/admin', admin())).decision).toBe('allow')
    expect((await decide('/admin/advanced', admin())).decision).toBe('allow')
    expect((await decide('/admin', staff())).decision).toBe('not-found')
    expect((await decide('/admin/advanced', staff())).decision).toBe('not-found')
    expect((await decide('/admin')).decision).toBe('sign-in')
  })

  it('gives each page of settings an entry in its group, and nothing in the console', async () => {
    const nav = await (await call(handle, 'GET', '/api/core/navigation?shell=admin', { actor: admin() })).json() as { groups: { id: string, everyday: { id: string, to: string }[] }[] }
    const entries = Object.fromEntries(nav.groups.map(g => [g.id, g.everyday.map(e => `${e.id} ${e.to}`)]))
    expect(entries.theatre).toEqual(['core.theatre-settings /admin/theatre', 'core.branding-settings /admin/branding'])
    expect(entries.access).toEqual(['core.sign-in-settings /admin/sign-in'])
    expect(entries.upkeep).toContain('core.advanced-settings /admin/advanced')
    expect(Object.values(entries).flat().join(' ')).not.toContain('/admin/settings')
    // Nothing of theirs is left in the console, so it is no business of theirs.
    expect((await call(handle, 'GET', '/api/core/navigation?shell=console', { actor: admin() })).status).toBe(404)
  })

  it('answers by page and by screen, every item naming its home', async () => {
    const advanced = await (await settings('page=core.advanced')).json() as Settings
    expect(advanced.page).toMatchObject({ id: 'core.advanced', to: '/admin/advanced' })
    expect(advanced.settings.map(s => s.key)).toEqual(expect.arrayContaining(['core.units.set-rows-limit', 'core.rate-limits.sign-in', 'core.delivery.stuck-after']))
    expect(new Set(advanced.settings.map(s => s.page))).toEqual(new Set(['core.advanced']))
    const email = await (await settings('screen=/admin/email', person(['core.sender.manage']))).json() as Settings
    expect(email.settings.map(s => s.key).sort()).toEqual(['core.notifications.sending-domain', 'core.notifications.verified-domain'])
    // Until the Email screen draws the footer and the sending label, they are on the Theatre page.
    const theatre = await (await settings('page=core.theatre', person(['core.sender.manage']))).json() as Settings
    expect(theatre.settings.map(s => s.key)).toEqual(expect.arrayContaining(['core.notifications.email-footer', 'core.notifications.sending-label']))
    expect(new Set(email.settings.map(s => s.screen))).toEqual(new Set(['/admin/email']))
    expect((await settings('page=core.advanced', staff())).status).toBe(404)
    expect((await settings('page=core.advanced&scope=site')).status).toBe(422) // one page, screen or module at a time
  })

  it('still answers the older module and scope form, leaving out what a bespoke screen manages', async () => {
    const site = await (await settings('scope=site', person(['core.settings.manage', 'core.sender.manage']))).json() as Settings
    expect(site.settings.every(s => s.scope === 'site')).toBe(true)
    expect(site.settings.map(s => s.key)).toContain('core.units.set-rows-limit')
    expect(site.settings.map(s => s.key)).not.toContain('core.notifications.sending-domain')
    const people = await (await settings('module=core&scope=module', person(['core.identity-settings.manage', 'core.programme.configure']))).json() as Settings
    expect(new Set(people.settings.map(s => s.page))).toEqual(new Set(['core.people', 'core.programme']))
    expect((await settings('scope=module')).status).toBe(422) // a scope of 'module' needs a module
  })
})

describe('counts and hideEmpty (UI-04)', () => {
  const sections = async (actor: ReturnType<typeof person>) => (await (await call(handle, 'GET', '/api/core/account-sections', { actor })).json() as { sections: { id: string, count?: number }[] }).sections
  const entries = async () => (await (await call(handle, 'GET', '/api/core/navigation?shell=console', { actor: staff() })).json() as { groups: { id: string, everyday: { id: string, count?: number }[] }[] }).groups.find(g => g.id === 'gallery')!.everyday

  it('shows an entry with its count while there is something to count', async () => {
    const drafts = (await entries()).find(e => e.id === 'gallery.drafts')
    expect(drafts?.count).toBe(3)
  })

  it('leaves an empty entry out of the menu, but still opens its address', async () => {
    const actor = staff()
    await call(handle, 'PUT', '/api/core/settings', { actor, body: { changes: [{ key: 'gallery.demo.open', value: false }] } })
    try {
      expect((await entries()).map(e => e.id)).not.toContain('gallery.drafts')
      expect((await decide('/console/gallery/drafts', actor)).decision).toBe('allow')
    }
    finally {
      await call(handle, 'PUT', '/api/core/settings', { actor, body: { changes: [{ key: 'gallery.demo.open', reset: true }] } })
    }
  })

  it('lists account sections for the person, in order, and drops an empty one', async () => {
    const actor = audience()
    // The gallery's own sections; identity's (the access scheme) show beside them.
    const gallery = async () => (await sections(actor)).map(s => s.id).filter(id => id.startsWith('gallery.'))
    expect(await gallery()).toEqual(['gallery.tickets', 'gallery.drafts'])
    const admin = staff()
    await call(handle, 'PUT', '/api/core/settings', { actor: admin, body: { changes: [{ key: 'gallery.demo.open', value: false }] } })
    try {
      expect(await gallery()).toEqual(['gallery.tickets'])
    }
    finally {
      await call(handle, 'PUT', '/api/core/settings', { actor: admin, body: { changes: [{ key: 'gallery.demo.open', reset: true }] } })
    }
  })

  it('refuses account sections to someone signed out', async () => {
    expect((await call(handle, 'GET', '/api/core/account-sections')).status).toBe(401)
  })
})

describe("the members' area (UI-03)", () => {
  it('answers not found for a person who is not a member, and for the area when it is off', async () => {
    expect((await decide('/members', audience())).decision).toBe('not-found')
    expect((await call(handle, 'GET', '/api/core/navigation?shell=members', { actor: audience() })).status).toBe(404)
    const sections = await (await call(handle, 'GET', '/api/core/account-sections?side=members', { actor: audience() })).json() as { sections: unknown[] }
    expect(sections.sections).toEqual([])
  })
})

describe('home cards, record tabs and history (UI-12, UI-16)', () => {
  const get = async (path: string, actor?: ReturnType<typeof person>) => (await (await call(handle, 'GET', path, { actor })).json())

  it('shows cards most urgent first and leaves out a card whose count is zero', async () => {
    const { cards } = await get('/api/core/home?home=console', reader())
    expect(cards.map((c: { id: string }) => c.id)).toEqual(['gallery.drafts-waiting', 'gallery.tip'])
    expect(cards[0].count).toBe(3)
  })

  it('shows nothing of a card the person may not open, and starting points only when nothing waits', async () => {
    const body = await get('/api/core/home?home=console', audience())
    expect(body.cards).toEqual([])
    expect(body.starters).toEqual([])
    const some = await get('/api/core/home?home=console', reader())
    expect(some.starters).toEqual([])
  })

  it('hides the members\' home from someone who is not a member', async () => {
    expect(await get('/api/core/home?home=members', audience())).toEqual({ cards: [], starters: [] })
  })

  it('lists the tabs other modules add, and none once that module is off', async () => {
    const { tabs } = await get('/api/core/record-tabs?record=gallery.production', reader())
    expect(tabs).toEqual([{ id: 'gallery.tickets', labelKey: 'gallery.record-tabs.tickets.label', component: 'GalleryTicketsTab', count: 3 }])
    expect((await get('/api/core/record-tabs?record=gallery.production', audience())).tabs).toEqual([])
    // Another module's tab, which goes when that module is switched off.
    const both = person(['gallery.sample.view', 'seats.orders.sell'])
    expect((await get('/api/core/record-tabs?record=gallery.production', both)).tabs.map((t: { id: string }) => t.id)).toEqual(['gallery.tickets', 'seats.sales'])
    const owner = person(['core.modules.manage'])
    await call(handle, 'PUT', '/api/core/modules/seats', { actor: owner, body: { on: false } })
    expect((await get('/api/core/record-tabs?record=gallery.production', both)).tabs.map((t: { id: string }) => t.id)).toEqual(['gallery.tickets'])
    await call(handle, 'PUT', '/api/core/modules/seats', { actor: owner, body: { on: true } })
  })

  it('gives a record\'s history only to someone who may see it, newest first', async () => {
    await env.DB.prepare('INSERT INTO core_audit (id, at, actor_name, actor_kind, action, record_type, record_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind('aud_h1', 1000, 'Sam Staff', 'person', 'create', 'gallery.production', 'prod-1', '{"field":"name"}').run()
    await env.DB.prepare('INSERT INTO core_audit (id, at, actor_name, actor_kind, action, record_type, record_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind('aud_h2', 2000, 'Sam Staff', 'person', 'update', 'gallery.production', 'prod-1', null).run()
    const path = '/api/core/history?type=gallery.production&id=prod-1'
    expect((await call(handle, 'GET', path)).status).toBe(401)
    expect((await call(handle, 'GET', path, { actor: reader() })).status).toBe(403)
    const { entries } = await get(path, person(['core.history.view']))
    expect(entries.map((e: { action: string }) => e.action)).toEqual(['update', 'create'])
    expect(entries[1].detail).toEqual({ field: 'name' })
  })
})

describe('Site administration in the viewer (R-33)', () => {
  const sides = async (actor: ReturnType<typeof person>) => (await (await call(handle, 'GET', '/api/core/viewer', { actor })).json()).sides as string[]

  it('offers the admin side to someone who holds an admin entry\'s ability, and only them', async () => {
    expect(await sides(person(['core.settings.manage']))).toContain('admin')
    expect(await sides(staff())).not.toContain('admin')
    expect(await sides(audience())).not.toContain('admin')
  })

  it('answers /admin as a missing page to someone with no admin ability', async () => {
    expect((await decide('/admin', staff())).decision).toBe('not-found')
    expect((await decide('/admin', person(['core.settings.manage']))).decision).toBe('allow')
  })
})
