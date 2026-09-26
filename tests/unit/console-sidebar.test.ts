import { describe, expect, test } from 'bun:test'
import { SIDEBAR_DEFAULT_SIZE, SIDEBAR_LABEL_MAX, openOnArrival, sidebarParts } from '#shared/utils/console-sidebar'
import { CONSOLE_HOME, CONSOLE_NAV } from '#shared/utils/site-nav'
import type { NavGroup } from '#shared/utils/site-nav'

// Decision 0105 and issue #1365: a heading that opens onto one screen is a click that shows
// nothing, so a group with one visible entry is drawn as that entry, and a lone group is open.

// A group as a viewer sees it: the declaration, filtered to the first `visible` entries.
function seen(key: string, visible: number): NavGroup {
  const group = CONSOLE_NAV.find(candidate => candidate.key === key)!
  return { ...group, items: group.items.slice(0, visible) }
}

describe('a group with one visible entry is drawn as that entry (0105)', () => {
  test('in its own place in the fixed order, between the groups either side', () => {
    const parts = sidebarParts([seen('rota', 3), seen('reports', 1), seen('money', 2)])
    expect(parts.map(part => part.kind)).toEqual(['group', 'entry', 'group'])
    const [, reports] = parts
    expect(reports?.kind === 'entry' && reports.entry.to).toBe('/reports')
  })

  test('a group narrowed to one entry by the viewer\'s abilities is a link too', () => {
    const parts = sidebarParts([seen('box-office', 1)])
    expect(parts).toEqual([{ kind: 'entry', entry: seen('box-office', 1).items[0]! }])
  })

  test('a group holding two or more stays a group, with every entry in it', () => {
    const [money] = sidebarParts([seen('money', 7)])
    expect(money?.kind === 'group' && money.group.items.length).toBe(7)
  })
})

describe('a sidebar holding one group opens it on arrival (0105)', () => {
  test('one group beside links is open before any route lands in it', () => {
    expect(openOnArrival([seen('money', 7), seen('reports', 1)])).toEqual(['money'])
  })

  test('two groups open only as the route or the officer opens them', () => {
    expect(openOnArrival([seen('rota', 2), seen('money', 2)])).toEqual([])
  })

  test('links alone open nothing', () => {
    expect(openOnArrival([seen('reports', 1), seen('box-office', 1)])).toEqual([])
  })
})

// "Shift templ..." and "Daily recon..." at 1280 wide: a label is read whole or it is not read.
describe('every console label fits the sidebar at its default width (issue #1365)', () => {
  test('no label, group or entry, runs past the budget the default width allows', () => {
    const labels = [CONSOLE_HOME.label, ...CONSOLE_NAV.flatMap(group => [group.label, ...group.items.map(item => item.label)])]
    expect(labels.filter(label => label.length > SIDEBAR_LABEL_MAX)).toEqual([])
  })

  test('the console layout opens the sidebar at that width', async () => {
    expect(SIDEBAR_DEFAULT_SIZE).toBeGreaterThan(15)
    const layout = await Bun.file('app/layouts/console.vue').text()
    expect(layout).toContain(':default-size="SIDEBAR_DEFAULT_SIZE"')
  })
})
