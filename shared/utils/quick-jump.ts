import { can, viewAccounts, viewBarCatalogue, viewBarStock, viewMembers, viewProgramme, viewTrainingCatalogue } from './abilities'
import { accountsList } from './accounts-list'
import { barItemsList } from './bar-items-list'
import { barProductsList } from './bar-products-list'
import { visibleGroups } from './console-sidebar'
import { membershipsList } from './memberships-list'
import { showsList } from './shows-list'
import { CONSOLE_HOME } from './site-nav'
import { trainingModulesList } from './training-modules-list'
import type { Viewer } from './abilities'
import type { BouncerAbility } from 'nuxt-authorization/utils'

// Ctrl+K over the console (0256): every screen the sidebar would draw for the viewer, and a typed
// name or title sent to the list that searches it. Nothing here reads a request or the database.

export interface QuickJumpItem {
  id: string
  label: string
  suffix?: string
  icon: string
  to: string
}

export interface QuickJumpGroup {
  id: string
  label: string
  items: QuickJumpItem[]
}

// The sidebar's own groups in its fixed order, each entry carrying its section, so two screens with
// like names are told apart by where they live (K-201 criteria 2 to 4).
export function quickJumpScreens(viewer: Viewer | null): QuickJumpGroup[] {
  const home = can(viewer, CONSOLE_HOME.ability)
    ? [{ id: 'home', label: CONSOLE_HOME.label, items: [{ id: CONSOLE_HOME.to, label: CONSOLE_HOME.label, icon: CONSOLE_HOME.icon, to: CONSOLE_HOME.to }] }]
    : []
  return [...home, ...visibleGroups(viewer).map(group => ({
    id: group.key,
    label: group.label,
    items: group.items.map(entry => ({ id: entry.to, label: entry.label, suffix: entry.section, icon: entry.icon, to: entry.to })),
  }))]
}

interface QuickFind {
  says: string
  icon: string
  to: string
  ability: BouncerAbility<Viewer>
  // The list's own declared limit, so a long paste is cut where its own search box would cut it.
  maxLength: number
}

// Each list already reads `?search=` from the address, the way its own toolbar writes it (K-129).
export const QUICK_FINDS: QuickFind[] = [
  { says: 'Accounts', icon: 'i-lucide-users', to: '/people/accounts', ability: viewAccounts, maxLength: accountsList.search.maxLength },
  { says: 'Members', icon: 'i-lucide-id-card', to: '/people/members', ability: viewMembers, maxLength: membershipsList.search.maxLength },
  { says: 'Shows', icon: 'i-lucide-drama', to: '/box-office/shows', ability: viewProgramme, maxLength: showsList.search.maxLength },
  { says: 'Stocked items', icon: 'i-lucide-package', to: '/bar/stock', ability: viewBarStock, maxLength: barItemsList.search.maxLength },
  { says: 'Products', icon: 'i-lucide-cup-soda', to: '/bar/products', ability: viewBarCatalogue, maxLength: barProductsList.search.maxLength },
  { says: 'Training modules', icon: 'i-lucide-library', to: '/training/manage', ability: viewTrainingCatalogue, maxLength: trainingModulesList.search.maxLength },
]

// Two characters before anything is offered, the shortest any list's search answers usefully.
export const QUICK_FIND_MIN = 2

export function quickFinds(viewer: Viewer | null, typed: string): QuickJumpItem[] {
  const term = typed.trim()
  if (term.length < QUICK_FIND_MIN) return []
  return QUICK_FINDS.filter(find => can(viewer, find.ability)).map((find) => {
    const cut = term.slice(0, find.maxLength)
    return { id: `find:${find.to}`, label: `${find.says} matching ${cut}`, icon: find.icon, to: `${find.to}?search=${encodeURIComponent(cut)}` }
  })
}
