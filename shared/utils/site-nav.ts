import {
  decideRoomRequests,
  reachConsole,
  recalculateTraining,
  runTrainingSessions,
  signedIn,
  viewAccounts,
  viewAuditTrail,
  viewFellows,
  viewMembers,
  viewRooms,
  viewSettings,
  viewTrainingCatalogue,
  workTonight,
} from './abilities'
import type { Viewer } from './abilities'
import type { BouncerAbility } from 'nuxt-authorization/utils'

// Every navigable destination in the signed-in system, declared once. The console sidebar renders
// from it and the console middleware guards from it, so a deep link and the nav cannot disagree.
export interface NavEntry {
  label: string
  icon: string
  to: string
  ability: BouncerAbility<Viewer>
  // Overview matches every console route unless it is told not to.
  exact?: boolean
}

export interface NavGroup {
  key: string
  label: string
  icon: string
  // Every item in the group sits under this, which is what the middleware matches on.
  prefix: string
  items: NavEntry[]
}

export const CONSOLE_HOME: NavEntry = {
  label: 'Overview',
  icon: 'i-lucide-layout-dashboard',
  to: '/admin',
  ability: reachConsole,
  exact: true,
}

// A fixed order, the same for everybody, so the sidebar is stable enough to learn. A group with
// nothing visible in it does not render; the empty ones are where the modules land (docs 0040).
export const CONSOLE_NAV: NavGroup[] = [
  { key: 'tonight', label: 'Tonight', icon: 'i-lucide-moon-star', prefix: '/tonight', items: [] },
  { key: 'box-office', label: 'Box office', icon: 'i-lucide-ticket', prefix: '/box-office', items: [] },
  { key: 'bar', label: 'Bar', icon: 'i-lucide-beer', prefix: '/bar', items: [] },
  {
    key: 'spaces',
    label: 'Spaces',
    icon: 'i-lucide-door-open',
    prefix: '/rooms/manage',
    items: [
      { label: 'Rooms', icon: 'i-lucide-door-open', to: '/rooms/manage', ability: viewRooms, exact: true },
      { label: 'Room requests', icon: 'i-lucide-inbox', to: '/rooms/manage/requests', ability: decideRoomRequests },
      { label: 'Closures', icon: 'i-lucide-construction', to: '/rooms/manage/closures', ability: viewRooms },
      { label: 'Other rooms', icon: 'i-lucide-map-pin', to: '/rooms/manage/other', ability: viewRooms },
      { label: 'Utilisation', icon: 'i-lucide-chart-column', to: '/rooms/manage/utilisation', ability: viewRooms },
    ],
  },
  {
    key: 'training',
    label: 'Training',
    icon: 'i-lucide-graduation-cap',
    prefix: '/training/manage',
    items: [
      { label: 'Catalogue', icon: 'i-lucide-graduation-cap', to: '/training/manage', ability: viewTrainingCatalogue, exact: true },
      { label: 'Departments', icon: 'i-lucide-building-2', to: '/training/manage/departments', ability: viewTrainingCatalogue },
      { label: 'Records', icon: 'i-lucide-clipboard-check', to: '/training/manage/records', ability: viewTrainingCatalogue },
      { label: 'Sessions', icon: 'i-lucide-calendar-days', to: '/training/manage/sessions', ability: runTrainingSessions },
      { label: 'Deliveries', icon: 'i-lucide-history', to: '/training/manage/deliveries', ability: runTrainingSessions },
      { label: 'Requests', icon: 'i-lucide-hand', to: '/training/manage/requests', ability: viewTrainingCatalogue },
      { label: 'Recalculation', icon: 'i-lucide-calendar-sync', to: '/training/manage/recalculation', ability: recalculateTraining },
    ],
  },
  {
    key: 'people',
    label: 'People',
    icon: 'i-lucide-users',
    prefix: '/people',
    items: [
      { label: 'Accounts', icon: 'i-lucide-users', to: '/people/accounts', ability: viewAccounts },
      { label: 'Members', icon: 'i-lucide-badge-check', to: '/people/members', ability: viewMembers },
      { label: 'Fellows', icon: 'i-lucide-award', to: '/people/fellows', ability: viewFellows },
    ],
  },
  { key: 'money', label: 'Money', icon: 'i-lucide-banknote', prefix: '/money', items: [] },
  { key: 'comms', label: 'Communications', icon: 'i-lucide-send', prefix: '/comms', items: [] },
  {
    key: 'system',
    label: 'System',
    icon: 'i-lucide-settings',
    prefix: '/admin',
    items: [
      { label: 'Settings', icon: 'i-lucide-settings', to: '/admin/settings', ability: viewSettings },
      { label: 'Audit trail', icon: 'i-lucide-scroll-text', to: '/admin/audit', ability: viewAuditTrail },
    ],
  },
]

// The member's own screens. The footer shows these to everybody and sends a signed-out visitor
// through /sign-in?next=, so somebody who followed a link still arrives where they meant to.
export const MEMBER_NAV: NavEntry[] = [
  { label: 'My bookings', icon: 'i-lucide-calendar-check', to: '/rooms/mine', ability: signedIn },
  { label: 'Book a room', icon: 'i-lucide-door-open', to: '/rooms', ability: signedIn, exact: true },
  { label: 'My training', icon: 'i-lucide-graduation-cap', to: '/training', ability: signedIn, exact: true },
  { label: 'My profile', icon: 'i-lucide-user', to: '/account/profile', ability: signedIn },
  { label: 'Sign-in and security', icon: 'i-lucide-shield', to: '/account/security', ability: signedIn },
]

// The account menu is the only place all four shells are reachable from each other, because it is
// the one component every shell renders (0040).
export const SHELL_NAV: NavEntry[] = [
  { label: 'Tonight', icon: 'i-lucide-moon-star', to: '/tonight', ability: workTonight },
  { label: 'Manage', icon: 'i-lucide-layout-dashboard', to: '/admin', ability: reachConsole },
]

// The public half of the footer. J-110 writes these pages; until it does there is nothing to link
// to, and a link to a route that 404s is worse than no navigation at all.
export const PUBLIC_NAV: NavEntry[] = []

// Longest prefix wins, so /rooms/manage/requests is matched by its own entry and not by /rooms.
export function entryFor(path: string): NavEntry | null {
  const every = [CONSOLE_HOME, ...CONSOLE_NAV.flatMap(group => group.items)]
  const matches = every.filter(entry => (entry.exact ? path === entry.to : path === entry.to || path.startsWith(`${entry.to}/`)))
  return matches.sort((a, b) => b.to.length - a.to.length)[0] ?? null
}

export function groupFor(path: string): NavGroup | null {
  const matches = CONSOLE_NAV.filter(group => path === group.prefix || path.startsWith(`${group.prefix}/`))
  return matches.sort((a, b) => b.prefix.length - a.prefix.length)[0] ?? null
}
