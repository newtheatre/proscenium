import { describe, expect, test } from 'bun:test'
import { visibleGroups } from '#shared/utils/console-sidebar'
import { QUICK_FINDS, QUICK_FIND_MIN, quickFinds, quickJumpScreens } from '#shared/utils/quick-jump'
import { PERMISSION_MAP } from '#shared/utils/roles'
import { CONSOLE_HOME, CONSOLE_NAV } from '#shared/utils/site-nav'
import type { Viewer } from '#shared/utils/abilities'
import type { Role } from '#shared/utils/roles'

// 0256 and K-201: the palette holds exactly the viewer's sidebar, and sends words to its lists.
const viewerHolding = (...roles: Role[]): Viewer => ({
  id: 'x',
  permissions: roles.flatMap(role => [...PERMISSION_MAP[role]]),
  onShiftTonight: false,
  leadsDepartment: false,
  isTrainer: false,
  keepsBarTab: false,
  membershipState: { kind: 'none' },
})

const ALL = Object.keys(PERMISSION_MAP) as Role[]
const destinations = (viewer: Viewer): string[] => quickJumpScreens(viewer).flatMap(group => group.items.map(item => item.to))

describe('the palette holds what the sidebar holds (K-201 criteria 2 to 4)', () => {
  test.each(ALL)('a %s finds exactly the screens their sidebar draws', (role) => {
    const viewer = viewerHolding(role)
    const sidebar = visibleGroups(viewer).flatMap(group => group.items.map(entry => entry.to))
    expect(destinations(viewer).filter(to => to !== CONSOLE_HOME.to)).toEqual(sidebar)
  })

  test('the groups come in the sidebar order, each entry carrying its section', () => {
    const groups = quickJumpScreens(viewerHolding(...ALL))
    expect(groups.map(group => group.id)).toEqual(['home', ...CONSOLE_NAV.map(group => group.key)])
    const stock = groups.find(group => group.id === 'bar')?.items.find(item => item.to === '/bar/stock')
    expect(stock).toMatchObject({ label: 'Stock', suffix: 'Every day' })
  })

  test('somebody with no console role finds nothing', () => {
    expect(destinations(viewerHolding())).toEqual([])
  })
})

describe('typed words go to the lists that search by them (0256)', () => {
  test('nothing is offered below the minimum, and only lists the viewer may open after it', () => {
    const everything = viewerHolding(...ALL)
    expect(quickFinds(everything, 'a'.repeat(QUICK_FIND_MIN - 1))).toEqual([])
    expect(quickFinds(everything, ' Hamlet ').map(item => item.to)).toEqual(QUICK_FINDS.map(find => `${find.to}?search=Hamlet`))
    expect(quickFinds(viewerHolding(), 'Hamlet')).toEqual([])
  })

  test('every offered list is a declared screen, so the palette adds no destination of its own', () => {
    const declared = CONSOLE_NAV.flatMap(group => group.items.map(entry => entry.to))
    for (const find of QUICK_FINDS) expect(declared).toContain(find.to)
  })

  test('the words are encoded, and cut at the search length each list declares', () => {
    const [accounts] = quickFinds(viewerHolding(...ALL), 'Sam & Alex')
    expect(accounts?.to).toBe('/people/accounts?search=Sam%20%26%20Alex')
    const long = 'x'.repeat(500)
    for (const item of quickFinds(viewerHolding(...ALL), long)) {
      const find = QUICK_FINDS.find(candidate => item.to.startsWith(`${candidate.to}?`))!
      expect(decodeURIComponent(item.to.split('search=')[1]!)).toHaveLength(find.maxLength)
    }
  })
})
