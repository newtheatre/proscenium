import type { NavEntry, NavGroup } from './site-nav'

// How the console sidebar draws the declaration a viewer can see (0105). The declaration itself,
// and the middleware that guards from it, are untouched: this is rendering only.

// Per cent of the window, which the dashboard sidebar sizes in; at 1280 wide it is 256px. The
// officer may widen it to the maximum, which is a bound on dragging and not a design width.
export const SIDEBAR_DEFAULT_SIZE = 20
export const SIDEBAR_MAX_SIZE = 30

// The longest label, group or entry, that reads whole at the default width (issue 1365).
export const SIDEBAR_LABEL_MAX = 22

export type SidebarPart = { kind: 'entry', entry: NavEntry } | { kind: 'group', group: NavGroup }

// A heading that opens onto one screen is a click that shows nothing, so a group whose viewer
// sees one entry is drawn as that entry, in the group's place in the fixed order (0105).
export function sidebarParts(groups: readonly NavGroup[]): SidebarPart[] {
  return groups.map(group => group.items.length === 1
    ? { kind: 'entry', entry: group.items[0]! }
    : { kind: 'group', group })
}

// A sidebar holding one group opens it on arrival: there is no other to choose between (0105).
export function openOnArrival(groups: readonly NavGroup[]): string[] {
  const drawn = sidebarParts(groups).filter(part => part.kind === 'group')
  return drawn.length === 1 && drawn[0]!.kind === 'group' ? [drawn[0]!.group.key] : []
}
