import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { ABILITY_PERMISSIONS, viewReports } from '#shared/utils/abilities'
import { contentPathOf } from '#shared/utils/docs-paths'
import { PERMISSIONS } from '#shared/utils/roles'
import { ACCOUNT_NAV, CONSOLE_HOME, CONSOLE_NAV, HEADER_NAV, MY_NAV, NAV_SECTIONS, PUBLIC_GROUPS, PUBLIC_NAV, SHELL_NAV, entryFor, groupFor, navCount } from '#shared/utils/site-nav'

// The navigation conventions are a test rather than a review habit (0040), the same way the admin
// component conventions are (0032). What review still judges is whether a label reads well.

const PAGES = 'app/pages'

// A detail page is reached from its list, and the catch-all only forwards an old link.
const NOT_IN_THE_NAV = new Set([
  'app/pages/bar/products/[id].vue',
  'app/pages/bar/products/new.vue',
  'app/pages/bar/stock/stocktakes/[id].vue',
  'app/pages/box-office/shows/[id].vue',
  'app/pages/people/accounts/[id].vue',
  'app/pages/comms/operations/accounts/[id].vue',
  'app/pages/training/manage/sessions/[id].vue',
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

// A route with no page file of its own may still resolve through a content catch-all (D-103,
// 0076), provided a markdown page exists at that path by Nuxt Content's own rules.
async function contentRoutes(): Promise<Set<string>> {
  const found = new Set<string>()
  for (const entry of new Bun.Glob('**/*.md').scanSync({ cwd: 'content', onlyFiles: true })) {
    found.add(contentPathOf(entry))
  }
  return found
}

// The route a page file serves, by Nuxt's own conventions.
function routeOf(path: string): string {
  const route = path.replace(`${PAGES}/`, '').replace(/\.vue$/, '').replace(/\/index$/, '')
  return `/${route === 'index' ? '' : route}`.replace(/\/$/, '') || '/'
}

const everyEntry = [CONSOLE_HOME, ...CONSOLE_NAV.flatMap(group => group.items), ...MY_NAV, ...ACCOUNT_NAV, ...SHELL_NAV, ...PUBLIC_NAV]

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
    const content = await contentRoutes()
    // Tonight is named before it is built, and its shell has one page under it already.
    const dangling = everyEntry.map(entry => entry.to).filter(to => !routes.has(to) && !content.has(to))
    expect(dangling).toEqual([])
  })
})

describe('a group is a job, and the order never varies (0040)', () => {
  test('the canonical order is what ships', () => {
    expect(CONSOLE_NAV.map(group => group.key)).toEqual([
      'rota', 'box-office', 'bar', 'spaces', 'training', 'people', 'money', 'reports', 'comms', 'system',
    ])
  })

  // Its holders span front of house, safety and the committee, so it is nobody's group but its
  // own (E-126 criterion 5, #1042).
  test('the cross-season reports are a group of their own, behind viewReports', () => {
    const reports = CONSOLE_NAV.find(group => group.key === 'reports')
    expect(reports).toMatchObject({ label: 'Reports', prefix: '/reports' })
    expect(reports?.items.map(item => item.to)).toEqual(['/reports'])
    expect(reports?.items[0]?.ability).toBe(viewReports)
  })

  // The group is desk work planned days ahead; Tonight is the phone shell a person works a show
  // night on, and one word named both until 0082.
  test('the rota administration group is called Rota', () => {
    expect(CONSOLE_NAV[0]).toMatchObject({ key: 'rota', label: 'Rota', prefix: '/rota/manage' })
    expect(CONSOLE_NAV.map(group => group.label)).not.toContain('Tonight')
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

// The sidebar said "Unfilled shifts" for months after the screen became the rota board (#1041).
// A label and its page's title are one name, with no exemptions: renaming one side alone fails (0082).
describe('a sidebar label is the title the page gives itself (0082)', () => {
  function titleOf(source: string): string | null {
    const meta = /definePageMeta\(\{[\s\S]*?\}\)/.exec(source)?.[0] ?? ''
    return /title:\s*'([^']*)'/.exec(meta)?.[1] ?? null
  }

  test('every console entry reads exactly as its page does', async () => {
    const sources = new Map((await pages()).map(page => [routeOf(page.path), page.source]))
    const drifted: string[] = []
    for (const item of [CONSOLE_HOME, ...CONSOLE_NAV.flatMap(group => group.items)]) {
      const source = sources.get(item.to)
      if (source === undefined) continue
      const title = titleOf(source)
      if (title !== item.label) drifted.push(`${item.to}: "${item.label}" against "${title}"`)
    }
    expect(drifted).toEqual([])
  })
})

// Three screens were called Reports, and two names were one register (issue #1365).
describe('no two console screens share a name', () => {
  const items = CONSOLE_NAV.flatMap(group => group.items)
  const labelOf = (to: string): string | undefined => items.find(item => item.to === to)?.label

  test('every console label is used once', () => {
    const labels = [CONSOLE_HOME.label, ...items.map(item => item.label)]
    expect([...new Set(labels.filter((label, index) => labels.indexOf(label) !== index))]).toEqual([])
  })

  test('each report screen says whose reports it holds', () => {
    expect(labelOf('/reports')).toBe('Night reports')
    expect(labelOf('/bar/reports')).toBe('Bar reports')
    expect(labelOf('/money/reports')).toBe('Comps and discounts')
  })

  test('the Challenge 25 register is called what the door calls it', () => {
    expect(labelOf('/rota/manage/age-checks')).toBe('Challenge 25 register')
  })
})

// An icon that marks two screens marks neither: the column stops carrying information, and
// i-lucide-beer stood for the Bar group, its products and a bar opening at once (0082).
describe('an icon belongs to one entry', () => {
  test('nothing in the console sidebar wears an icon twice', () => {
    const icons = [CONSOLE_HOME.icon, ...CONSOLE_NAV.flatMap(group => [group.icon, ...group.items.map(item => item.icon)])]
    const twice = icons.filter((icon, index) => icons.indexOf(icon) !== index)
    expect([...new Set(twice)]).toEqual([])
  })

  test('every icon is a lucide name', () => {
    const stray = [CONSOLE_HOME, ...CONSOLE_NAV.flatMap(group => group.items)]
      .filter(entry => !entry.icon.startsWith('i-lucide-'))
    expect(stray.map(entry => entry.to)).toEqual([])
  })
})

// Daily work and once-a-year set-up sat interleaved in every group (0082).
describe('a group splits into Every day and Set-up, or not at all', () => {
  test('every section named is one of the two', () => {
    const unknown = CONSOLE_NAV.flatMap(group => group.items)
      .filter(item => item.section !== undefined && !(NAV_SECTIONS as readonly string[]).includes(item.section))
    expect(unknown.map(item => item.to)).toEqual([])
  })

  test('a group either splits or does not', () => {
    const half = CONSOLE_NAV.filter(group =>
      group.items.some(item => item.section) && !group.items.every(item => item.section))
    expect(half.map(group => group.key)).toEqual([])
  })

  test('the every-day items come first, so a section is one run and not two', () => {
    const scrambled = CONSOLE_NAV.filter((group) => {
      const sections = group.items.map(item => item.section).filter(Boolean)
      return sections.some((section, index) => index > 0 && section !== sections[index - 1] && sections.slice(0, index).includes(section))
        || (sections.length > 0 && sections[0] !== 'Every day')
    })
    expect(scrambled.map(group => group.key)).toEqual([])
  })

  test('the groups the review named are the ones that split', () => {
    const split = CONSOLE_NAV.filter(group => group.items.some(item => item.section)).map(group => group.key)
    expect(split).toEqual(['rota', 'box-office', 'bar', 'spaces', 'training'])
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

describe('the members area and the account settings never overlap (K-127 criterion 2)', () => {
  test('MY_NAV opens on /my', () => {
    expect(MY_NAV[0]?.to).toBe('/my')
  })

  test('ACCOUNT_NAV is exactly the three account routes', () => {
    expect(ACCOUNT_NAV.map(entry => entry.to)).toEqual(['/account/profile', '/account/security', '/account/notifications'])
  })

  test('no destination sits in both lists', () => {
    const inBoth = MY_NAV.filter(entry => ACCOUNT_NAV.some(other => other.to === entry.to))
    expect(inBoth).toEqual([])
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

// A queue nobody can see from the screen they are on is a queue nobody works (A-130 criterion 11).
describe('a waiting count rides the entry that opens it', () => {
  const people = CONSOLE_NAV.find(group => group.key === 'people')!

  test('the Members entry carries the waiting claims', () => {
    expect(people.items.find(entry => entry.to === '/people/members')?.count).toBe('membership-claims')
  })

  // Declarations wait on a person to be met, so the queue is daily work with its count (issue 1334).
  test('Access profiles is Every day work carrying the declarations waiting', () => {
    const boxOffice = CONSOLE_NAV.find(group => group.key === 'box-office')!
    const entry = boxOffice.items.find(item => item.to === '/box-office/access-profiles')
    expect(entry?.section).toBe('Every day')
    expect(entry?.count).toBe('access-profiles')
    expect(navCount(boxOffice.items, { 'access-profiles': 2 })).toBe(2)
  })

  test('a group reads the sum of what its entries carry, and nothing when nothing waits', () => {
    expect(navCount(people.items, { 'membership-claims': 4 })).toBe(4)
    expect(navCount(people.items, { 'membership-claims': 0 })).toBe(0)
    expect(navCount(people.items, {})).toBe(0)
    expect(navCount(people.items.filter(entry => entry.to !== '/people/members'), { 'membership-claims': 4 })).toBe(0)
  })
})

describe('the public half of the navigation (J-111, D-103)', () => {
  // The footer renders a column per group, so an entry with none would be declared and then not
  // drawn anywhere: present in the file, absent from the site.
  test('every public entry names the footer column it belongs to', () => {
    const homeless = PUBLIC_NAV.filter(entry => !entry.group || !PUBLIC_GROUPS.includes(entry.group))
    expect(homeless.map(entry => entry.to)).toEqual([])
  })

  test('no group is declared with nothing in it', () => {
    const empty = PUBLIC_GROUPS.filter(group => !PUBLIC_NAV.some(entry => entry.group === group))
    expect(empty).toEqual([])
  })

  // The header is a slice of the footer's list rather than a second list of its own (0040).
  test('every header link is a public entry', () => {
    const stray = HEADER_NAV.filter(entry => !PUBLIC_NAV.includes(entry))
    expect(stray.map(entry => entry.to)).toEqual([])
  })
})
