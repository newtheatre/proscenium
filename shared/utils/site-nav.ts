import {
  anybody,
  decideRoomRequests,
  reachConsole,
  runTrainingSessions,
  signedIn,
  verifyAccessProfiles,
  viewAccounts,
  viewAuditTrail,
  viewBarCatalogue,
  viewBarStock,
  viewFellows,
  viewMembers,
  viewPassTypes,
  viewProgramme,
  viewRooms,
  viewRota,
  viewSettings,
  viewTicketTypes,
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
  // Module E: show night. `/tonight` is the phone-first shell rather than a console prefix, so
  // the console screens sit under `/rota/manage` as Spaces and Training do (0040, 0046).
  {
    key: 'tonight',
    label: 'Tonight',
    icon: 'i-lucide-moon-star',
    prefix: '/rota/manage',
    items: [
      { label: 'Shift templates', icon: 'i-lucide-clipboard-list', to: '/rota/manage/templates', ability: viewRota },
    ],
  },

  // Module D: ticketing
  {
    key: 'box-office',
    label: 'Box office',
    icon: 'i-lucide-ticket',
    prefix: '/box-office',
    items: [
      { label: 'Shows', icon: 'i-lucide-drama', to: '/box-office/shows', ability: viewProgramme },
      { label: 'Ticket types', icon: 'i-lucide-tag', to: '/box-office/ticket-types', ability: viewTicketTypes },
      { label: 'Passes', icon: 'i-lucide-wallet-cards', to: '/box-office/pass-types', ability: viewPassTypes },
      { label: 'Content warnings', icon: 'i-lucide-triangle-alert', to: '/box-office/content-warnings', ability: viewProgramme },
      { label: 'Access profiles', icon: 'i-lucide-accessibility', to: '/box-office/access-profiles', ability: verifyAccessProfiles },
    ],
  },

  // Module F: bar

  {
    key: 'bar',
    label: 'Bar',
    icon: 'i-lucide-beer',
    prefix: '/bar',
    items: [
      { label: 'Products', icon: 'i-lucide-beer', to: '/bar/products', ability: viewBarCatalogue },
      { label: 'Categories', icon: 'i-lucide-layout-grid', to: '/bar/categories', ability: viewBarCatalogue },
      { label: 'Stocked items', icon: 'i-lucide-package', to: '/bar/stock', ability: viewBarStock, exact: true },
      { label: 'Stock movements', icon: 'i-lucide-arrow-left-right', to: '/bar/stock/movements', ability: viewBarStock },
    ],
  },

  // Module C: spaces
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

  // Module G: training
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
      { label: 'Requests', icon: 'i-lucide-hand', to: '/training/manage/requests', ability: viewTrainingCatalogue },
    ],
  },

  // Module A: identity
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

  // Module I: finance
  { key: 'money', label: 'Money', icon: 'i-lucide-banknote', prefix: '/money', items: [] },

  // Module H: communications
  { key: 'comms', label: 'Communications', icon: 'i-lucide-send', prefix: '/comms', items: [] },

  // Module J: governance
  {
    key: 'system',
    label: 'System',
    icon: 'i-lucide-settings',
    prefix: '/admin',
    items: [
      { label: 'Settings', icon: 'i-lucide-settings', to: '/admin/settings', ability: viewSettings },
      { label: 'Audit trail', icon: 'i-lucide-scroll-text', to: '/admin/audit', ability: viewAuditTrail },

      // Module K: platform

    ],
  },
]

// The member's own screens. The footer shows these to everybody and sends a signed-out visitor
// through /sign-in?next=, so somebody who followed a link still arrives where they meant to.
export const MEMBER_NAV: NavEntry[] = [
  // Module D: ticketing

  { label: 'Access requirements', icon: 'i-lucide-accessibility', to: '/account/access', ability: signedIn },

  // Module C: spaces

  { label: 'My bookings', icon: 'i-lucide-calendar-check', to: '/rooms/mine', ability: signedIn },
  { label: 'Book a room', icon: 'i-lucide-door-open', to: '/rooms', ability: signedIn, exact: true },

  // Module E: show night

  { label: 'My rota', icon: 'i-lucide-clipboard-list', to: '/rota', ability: signedIn, exact: true },

  // Module G: training

  { label: 'My training', icon: 'i-lucide-graduation-cap', to: '/training', ability: signedIn, exact: true },
  { label: 'Training sessions', icon: 'i-lucide-calendar-days', to: '/training/sessions', ability: signedIn },

  // Module A: identity

  { label: 'My profile', icon: 'i-lucide-user', to: '/account/profile', ability: signedIn },
  { label: 'Sign-in and security', icon: 'i-lucide-shield', to: '/account/security', ability: signedIn },
]

// The account menu is the only place all four shells are reachable from each other, because it is
// the one component every shell renders (0040).
export const SHELL_NAV: NavEntry[] = [
  { label: 'Tonight', icon: 'i-lucide-moon-star', to: '/tonight', ability: workTonight },
  { label: 'Manage', icon: 'i-lucide-layout-dashboard', to: '/admin', ability: reachConsole },
]

// The public half of the footer: pages a visitor reads before they are anybody here. The policy
// pages J-110 writes join this list.
export const PUBLIC_NAV: NavEntry[] = [
  // Module D: ticketing

  { label: 'What\'s on', icon: 'i-lucide-drama', to: '/whats-on', ability: anybody },
  { label: 'About us', icon: 'i-lucide-info', to: '/about', ability: anybody },
  { label: 'Our history', icon: 'i-lucide-history', to: '/history', ability: anybody },
  { label: 'Get involved', icon: 'i-lucide-heart-handshake', to: '/get-involved', ability: anybody },
  { label: 'Technical specification', icon: 'i-lucide-wrench', to: '/technical-specification', ability: anybody },

  // Module G: training

  { label: 'What we teach', icon: 'i-lucide-graduation-cap', to: '/training/modules', ability: anybody },
]

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
