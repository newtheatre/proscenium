import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { ABILITY_PERMISSIONS } from '#shared/utils/abilities'
import { PERMISSIONS } from '#shared/utils/roles'
import { CONSOLE_HOME, CONSOLE_NAV, MEMBER_NAV, PUBLIC_NAV, SHELL_NAV, entryFor, groupFor } from '#shared/utils/site-nav'

// The navigation conventions are a test rather than a review habit (0040), the same way the admin
// component conventions are (0032). What review still judges is whether a label reads well.

const PAGES = 'app/pages'

// A detail page is reached from its list, and the catch-all only forwards an old link.
const NOT_IN_THE_NAV = new Set([
  'app/pages/people/accounts/[id].vue',
  'app/pages/admin/[...legacy].vue',
  'app/pages/dev.vue',
])

async function pages(): Promise<{ path: string, source: string }[]> {
  const found: { path: string, source: string }[] = []
  for (const entry of new Bun.Glob('**/*.vue').scanSync({ cwd: PAGES, onlyFiles: true })) {
    const path = join(PAGES, entry)
    found.push({ path, source: await Bun.file(path).text() })
  }
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

const consolePages = async (): Promise<string[]> =>
  (await pages()).filter(page => page.source.includes('layout: \'console\'')).map(page => page.path)

// The route a page file serves, by Nuxt's own conventions.
function routeOf(path: string): string {
  const route = path.replace(`${PAGES}/`, '').replace(/\.vue$/, '').replace(/\/index$/, '')
  return `/${route === 'index' ? '' : route}`.replace(/\/$/, '') || '/'
}

const everyEntry = [CONSOLE_HOME, ...CONSOLE_NAV.flatMap(group => group.items), ...MEMBER_NAV, ...SHELL_NAV, ...PUBLIC_NAV]

describe('every console screen is in the navigation (0040)', () => {
  test('no console page is missing from the declaration', async () => {
    const declared = new Set([CONSOLE_HOME.to, ...CONSOLE_NAV.flatMap(group => group.items.map(item => item.to))])
    const missing = (await consolePages())
      .filter(path => !NOT_IN_THE_NAV.has(path))
      .filter(path => !declared.has(routeOf(path)))
    expect(missing).toEqual([])
  })

  test('no screen is declared twice', () => {
    const routes = [CONSOLE_HOME.to, ...CONSOLE_NAV.flatMap(group => group.items.map(item => item.to))]
    expect(routes.length).toBe(new Set(routes).size)
  })

  // A link to a route that 404s is worse than no navigation at all, so it is a test and not care.
  test('every destination anywhere resolves to a page that exists', async () => {
    const routes = new Set((await pages()).map(page => routeOf(page.path)))
    // Tonight is named before it is built, and its shell has one page under it already.
    const dangling = everyEntry.map(entry => entry.to).filter(to => !routes.has(to))
    expect(dangling).toEqual([])
  })
})

describe('a group is a job, and the order never varies (0040)', () => {
  test('the canonical order is what ships', () => {
    expect(CONSOLE_NAV.map(group => group.key)).toEqual([
      'tonight', 'box-office', 'bar', 'spaces', 'training', 'people', 'money', 'comms', 'system',
    ])
  })

  test('every item sits under its own group prefix', () => {
    const stray = CONSOLE_NAV.flatMap(group =>
      group.items.filter(item => item.to !== group.prefix && !item.to.startsWith(`${group.prefix}/`))
        .map(item => `${group.key}: ${item.to}`))
    expect(stray).toEqual([])
  })

  test('every group carries a label and an icon', () => {
    expect(CONSOLE_NAV.filter(group => !group.label || !group.icon).map(group => group.key)).toEqual([])
  })
})

describe('the vocabulary has not drifted from the permission map (0009)', () => {
  test('every ability stands on a real permission', () => {
    const unknown = Object.entries(ABILITY_PERMISSIONS)
      .filter(([, permission]) => !(PERMISSIONS as readonly string[]).includes(permission))
      .map(([ability]) => ability)
    expect(unknown).toEqual([])
  })

  test('every navigable entry carries an ability', () => {
    expect(everyEntry.filter(entry => typeof entry.ability?.execute !== 'function').map(entry => entry.to)).toEqual([])
  })
})

describe('the middleware and the sidebar read the same declaration', () => {
  // Overview would otherwise be the active item on every console route.
  test('overview matches only itself', () => {
    expect(CONSOLE_HOME.exact).toBe(true)
    expect(entryFor('/admin')?.to).toBe('/admin')
    expect(entryFor('/admin/settings')?.to).toBe('/admin/settings')
  })

  test('a detail page is guarded by the screen it belongs to', () => {
    expect(entryFor('/people/accounts/abc123')?.to).toBe('/people/accounts')
  })

  // Longest prefix wins, or /rooms/manage/requests would answer to the rooms entry.
  test('the deepest entry wins', () => {
    expect(entryFor('/rooms/manage/requests')?.to).toBe('/rooms/manage/requests')
    expect(entryFor('/rooms/manage')?.to).toBe('/rooms/manage')
  })

  test('a console route resolves to the group that holds it', () => {
    expect(groupFor('/rooms/manage/closures')?.key).toBe('spaces')
    expect(groupFor('/people/members')?.key).toBe('people')
    expect(groupFor('/admin/audit')?.key).toBe('system')
  })
})
