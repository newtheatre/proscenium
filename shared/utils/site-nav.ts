import {
  anybody,
  decideRoomRequests,
  exportAgeChecks,
  manageBarTabs,
  reachConsole,
  runTrainingSessions,
  sendAnnouncements,
  signedIn,
  verifyAccessProfiles,
  viewAccounts,
  viewAuditTrail,
  viewBackups,
  viewBarCatalogue,
  viewBarReports,
  viewBarStock,
  viewBoardConfig,
  viewChecklist,
  viewCommsOperations,
  viewEmergencyCard,
  viewFellows,
  viewFinanceReports,
  viewMembers,
  viewPassTypes,
  viewProgramme,
  viewReports,
  viewRooms,
  viewRota,
  viewSafety,
  viewSeasonSummary,
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
  // The section within its console group. A group either splits or does not: every item names
  // one or none does, or some items would sit under a heading that does not describe them (0082).
  section?: NavSection
  // The footer column this entry sits under. Public entries only, and required of them, so a new
  // public page joins a column by saying which rather than by being listed a second time.
  group?: PublicGroup
  // A queue waiting behind this entry, counted on the sidebar so it is seen from any screen.
  count?: NavCount
}

export const NAV_COUNTS = ['membership-claims'] as const

export type NavCount = (typeof NAV_COUNTS)[number]

// What a group or an entry shows: the sum of the counts its visible entries carry (A-130).
export function navCount(items: readonly NavEntry[], counts: Partial<Record<NavCount, number>>): number {
  return items.reduce((sum, entry) => sum + (entry.count ? counts[entry.count] ?? 0 : 0), 0)
}

// The work of a week against what a committee configures once and leaves alone (0082).
export const NAV_SECTIONS = ['Every day', 'Set-up'] as const

export type NavSection = (typeof NAV_SECTIONS)[number]

export const PUBLIC_GROUPS = ['Visit', 'Join in', 'About'] as const

export type PublicGroup = (typeof PUBLIC_GROUPS)[number]

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

// A fixed order, the same for everybody; a group with nothing visible in it does not render (0040).
// Within a group, Every day comes before Set-up, and the two never interleave (0082).
export const CONSOLE_NAV: NavGroup[] = [
  // Module E: show night. `/tonight` is the phone-first shell rather than a console prefix, so
  // the console screens sit under `/rota/manage` as Spaces and Training do (0040, 0046).
  {
    key: 'rota',
    label: 'Rota',
    icon: 'i-lucide-calendar-clock',
    prefix: '/rota/manage',
    items: [
      { label: 'Rota board', icon: 'i-lucide-users-round', to: '/rota/manage/shifts', ability: viewRota, section: 'Every day' },
      { label: 'Approvals', icon: 'i-lucide-check-check', to: '/rota/manage/approvals', ability: viewRota, section: 'Every day' },
      { label: 'Bar openings', icon: 'i-lucide-store', to: '/rota/manage/openings', ability: viewRota, section: 'Every day' },
      { label: 'Safety', icon: 'i-lucide-hard-hat', to: '/rota/manage/safety', ability: viewSafety, section: 'Every day' },
      { label: 'Age-check register', icon: 'i-lucide-id-card', to: '/rota/manage/age-checks', ability: exportAgeChecks, section: 'Every day' },
      { label: 'Shift templates', icon: 'i-lucide-layout-template', to: '/rota/manage/templates', ability: viewRota, section: 'Set-up' },
      { label: 'Checklists', icon: 'i-lucide-list-checks', to: '/rota/manage/checklists', ability: viewChecklist, section: 'Set-up' },
      { label: 'Emergency cards', icon: 'i-lucide-siren', to: '/rota/manage/emergency', ability: viewEmergencyCard, section: 'Set-up' },
      { label: 'Backstage board', icon: 'i-lucide-radio', to: '/rota/manage/backstage', ability: viewBoardConfig, section: 'Set-up' },
    ],
  },

  // Module D: ticketing
  {
    key: 'box-office',
    label: 'Box office',
    icon: 'i-lucide-ticket',
    prefix: '/box-office',
    items: [
      { label: 'Desk', icon: 'i-lucide-ticket-check', to: '/box-office/desk', ability: viewProgramme, section: 'Every day' },
      // A noun beside Desk, rather than the console's one verb label: the screen is a desk of its
      // own, with its own table and its own refusals (0082).
      { label: 'Pass desk', icon: 'i-lucide-ticket-plus', to: '/box-office/desk-passes', ability: viewProgramme, section: 'Every day' },
      { label: 'Shows', icon: 'i-lucide-drama', to: '/box-office/shows', ability: viewProgramme, section: 'Every day' },
      { label: 'Ticket types', icon: 'i-lucide-tag', to: '/box-office/ticket-types', ability: viewTicketTypes, section: 'Set-up' },
      { label: 'Pass types', icon: 'i-lucide-wallet-cards', to: '/box-office/pass-types', ability: viewPassTypes, section: 'Set-up' },
      { label: 'Venues', icon: 'i-lucide-map-pin', to: '/box-office/venues', ability: viewProgramme, section: 'Set-up' },
      { label: 'Seasons', icon: 'i-lucide-calendar-range', to: '/box-office/seasons', ability: viewProgramme, section: 'Set-up' },
      { label: 'Show categories', icon: 'i-lucide-shapes', to: '/box-office/show-categories', ability: viewProgramme, section: 'Set-up' },
      { label: 'Content warnings', icon: 'i-lucide-triangle-alert', to: '/box-office/content-warnings', ability: viewProgramme, section: 'Set-up' },
      { label: 'Access profiles', icon: 'i-lucide-accessibility', to: '/box-office/access-profiles', ability: verifyAccessProfiles, section: 'Set-up' },
    ],
  },

  // Module F: bar
  {
    key: 'bar',
    label: 'Bar',
    icon: 'i-lucide-beer',
    prefix: '/bar',
    items: [
      // Stock and Movements are shorter than the titles they replaced, which truncated at the
      // sidebar's default width (issue 921); the group heading says which stock (0082).
      { label: 'Stock', icon: 'i-lucide-package', to: '/bar/stock', ability: viewBarStock, exact: true, section: 'Every day' },
      { label: 'Movements', icon: 'i-lucide-arrow-left-right', to: '/bar/stock/movements', ability: viewBarStock, section: 'Every day' },
      { label: 'Stocktakes', icon: 'i-lucide-clipboard-list', to: '/bar/stock/stocktakes', ability: viewBarStock, section: 'Every day' },
      { label: 'Order list', icon: 'i-lucide-truck', to: '/bar/stock/order-list', ability: viewBarStock, section: 'Every day' },
      { label: 'Tabs', icon: 'i-lucide-receipt', to: '/bar/tabs', ability: manageBarTabs, section: 'Every day' },
      { label: 'Reports', icon: 'i-lucide-bar-chart-3', to: '/bar/reports', ability: viewBarReports, section: 'Every day' },
      { label: 'Products', icon: 'i-lucide-cup-soda', to: '/bar/products', ability: viewBarCatalogue, section: 'Set-up' },
      { label: 'Product categories', icon: 'i-lucide-layout-grid', to: '/bar/categories', ability: viewBarCatalogue, section: 'Set-up' },
      { label: 'Discounts', icon: 'i-lucide-percent', to: '/bar/discounts', ability: viewBarCatalogue, section: 'Set-up' },
    ],
  },

  // Module C: spaces
  {
    key: 'spaces',
    label: 'Spaces',
    icon: 'i-lucide-door-open',
    prefix: '/rooms/manage',
    items: [
      { label: 'Room requests', icon: 'i-lucide-inbox', to: '/rooms/manage/requests', ability: decideRoomRequests, section: 'Every day' },
      { label: 'Bookings', icon: 'i-lucide-calendar-search', to: '/rooms/manage/bookings', ability: viewRooms, section: 'Every day' },
      { label: 'Closures', icon: 'i-lucide-construction', to: '/rooms/manage/closures', ability: viewRooms, section: 'Every day' },
      { label: 'Utilisation', icon: 'i-lucide-chart-column', to: '/rooms/manage/utilisation', ability: viewRooms, section: 'Every day' },
      { label: 'Rooms', icon: 'i-lucide-house', to: '/rooms/manage', ability: viewRooms, exact: true, section: 'Set-up' },
      { label: 'Other rooms', icon: 'i-lucide-map', to: '/rooms/manage/other', ability: viewRooms, section: 'Set-up' },
    ],
  },

  // Module G: training
  {
    key: 'training',
    label: 'Training',
    icon: 'i-lucide-graduation-cap',
    prefix: '/training/manage',
    items: [
      { label: 'Records', icon: 'i-lucide-clipboard-check', to: '/training/manage/records', ability: viewTrainingCatalogue, section: 'Every day' },
      { label: 'Sessions', icon: 'i-lucide-calendar-days', to: '/training/manage/sessions', ability: runTrainingSessions, section: 'Every day' },
      { label: 'Requests', icon: 'i-lucide-hand', to: '/training/manage/requests', ability: viewTrainingCatalogue, section: 'Every day' },
      { label: 'Catalogue', icon: 'i-lucide-library', to: '/training/manage', ability: viewTrainingCatalogue, exact: true, section: 'Set-up' },
      { label: 'Departments', icon: 'i-lucide-building-2', to: '/training/manage/departments', ability: viewTrainingCatalogue, section: 'Set-up' },
    ],
  },

  // Module A: identity. Four registers of people, which is one kind of thing, so the group is
  // not split (0082).
  {
    key: 'people',
    label: 'People',
    icon: 'i-lucide-users',
    prefix: '/people',
    items: [
      { label: 'Accounts', icon: 'i-lucide-user-round', to: '/people/accounts', ability: viewAccounts },
      { label: 'Roles', icon: 'i-lucide-shield', to: '/people/roles', ability: viewAccounts },
      { label: 'Members', icon: 'i-lucide-badge-check', to: '/people/members', ability: viewMembers, count: 'membership-claims' },
      { label: 'Fellows', icon: 'i-lucide-award', to: '/people/fellows', ability: viewFellows },
    ],
  },

  // Module I: finance
  {
    key: 'money',
    label: 'Money',
    icon: 'i-lucide-banknote',
    prefix: '/money',
    items: [
      { label: 'Money dashboard', icon: 'i-lucide-gauge', to: '/money', ability: viewSeasonSummary, exact: true },
      { label: 'Revenue by show', icon: 'i-lucide-trending-up', to: '/money/shows', ability: viewFinanceReports },
      { label: 'Comps and discounts', icon: 'i-lucide-gift', to: '/money/reports', ability: viewFinanceReports },
      { label: 'Daily reconciliation', icon: 'i-lucide-scale', to: '/money/reconciliation', ability: viewFinanceReports },
      { label: 'Ledger entries', icon: 'i-lucide-book-open-text', to: '/money/entries', ability: viewFinanceReports },
      { label: 'Periods', icon: 'i-lucide-lock', to: '/money/periods', ability: viewFinanceReports },
      { label: 'Exports', icon: 'i-lucide-file-down', to: '/money/exports', ability: viewFinanceReports },
    ],
  },

  // Module E's cross-season reports: read by front of house, safety and the committee, so a
  // group of their own rather than a corner of any one of theirs (E-126 criterion 5).
  {
    key: 'reports',
    label: 'Reports',
    icon: 'i-lucide-chart-line',
    prefix: '/reports',
    items: [
      { label: 'Reports', icon: 'i-lucide-chart-no-axes-combined', to: '/reports', ability: viewReports },
    ],
  },

  // Module H: communications
  {
    key: 'comms',
    label: 'Communications',
    icon: 'i-lucide-send',
    prefix: '/comms',
    items: [
      { label: 'Announce', icon: 'i-lucide-megaphone', to: '/comms/announce', ability: sendAnnouncements },
      { label: 'Send log', icon: 'i-lucide-list', to: '/comms/operations', ability: viewCommsOperations },
    ],
  },

  // Module J: governance
  {
    key: 'system',
    label: 'System',
    icon: 'i-lucide-settings',
    prefix: '/admin',
    items: [
      { label: 'Settings', icon: 'i-lucide-sliders-horizontal', to: '/admin/settings', ability: viewSettings },
      { label: 'Audit trail', icon: 'i-lucide-scroll-text', to: '/admin/audit', ability: viewAuditTrail },

      // Module K: platform
      { label: 'Backups', icon: 'i-lucide-database-backup', to: '/admin/backups', ability: viewBackups },

    ],
  },
]

// The member's own screens: what is mine right now (K-127 criterion 2). A signed-out visitor
// who followed a link is sent through /sign-in?next= to arrive where they meant to.
export const MY_NAV: NavEntry[] = [
  // Module K: platform

  { label: 'My NNT', icon: 'i-lucide-house', to: '/my', ability: signedIn, exact: true },

  // Module E: show night

  { label: 'My rota', icon: 'i-lucide-clipboard-list', to: '/rota', ability: signedIn, exact: true },

  // Module C: spaces

  { label: 'Book a room', icon: 'i-lucide-door-open', to: '/rooms', ability: signedIn, exact: true },
  { label: 'My room bookings', icon: 'i-lucide-calendar-check', to: '/rooms/mine', ability: signedIn },

  // Module G: training

  { label: 'My training', icon: 'i-lucide-graduation-cap', to: '/training', ability: signedIn, exact: true },
  { label: 'Training sessions', icon: 'i-lucide-calendar-days', to: '/training/sessions', ability: signedIn },

  // Module F: bar

  { label: 'My tab', icon: 'i-lucide-receipt', to: '/account/bar-tab', ability: signedIn },

  // Module D: ticketing

  { label: 'Passes', icon: 'i-lucide-wallet-cards', to: '/account/passes', ability: signedIn },
  { label: 'Access requirements', icon: 'i-lucide-accessibility', to: '/account/access', ability: signedIn },

  // Module A: identity. A membership refusal always lands here (A-129), so it reads as "mine
  // right now" rather than a setting, and sits in this list rather than ACCOUNT_NAV.
  { label: 'Membership', icon: 'i-lucide-badge-check', to: '/account/membership', ability: signedIn },
]

// The three account settings pages: how somebody is known to the system, not what they are doing
// tonight (K-127 criterion 3). `AccountSettings.vue` renders these as the settings side list.
export const ACCOUNT_NAV: NavEntry[] = [
  { label: 'Profile', icon: 'i-lucide-user', to: '/account/profile', ability: signedIn },
  // Shortened from "Sign-in and security": truncated in the settings aside at 1280 (issue 921).
  { label: 'Security', icon: 'i-lucide-shield', to: '/account/security', ability: signedIn },
  { label: 'Notifications', icon: 'i-lucide-bell', to: '/account/notifications', ability: signedIn },
]

// The account menu is the only place all four shells are reachable from each other, because it is
// the one component every shell renders (0040).
export const SHELL_NAV: NavEntry[] = [
  { label: 'My NNT', icon: 'i-lucide-house', to: '/my', ability: signedIn },
  { label: 'Tonight', icon: 'i-lucide-moon-star', to: '/tonight', ability: workTonight },
  { label: 'Manage', icon: 'i-lucide-layout-dashboard', to: '/admin', ability: reachConsole },
  // Reachable whether or not a viewer holds a standing permission, since an operational-only
  // shift is exactly who most needs the page for the screen in front of them (J-109 criterion 1).
  { label: 'Documentation', icon: 'i-lucide-book-open', to: '/docs', ability: signedIn },
]

// The public half of the footer: pages a visitor reads before they are anybody here. The policy
// pages J-110 writes join this list.
export const PUBLIC_NAV: NavEntry[] = [
  // Module D: ticketing

  { label: 'What\'s on', icon: 'i-lucide-drama', to: '/whats-on', ability: anybody, group: 'Visit' },
  { label: 'About us', icon: 'i-lucide-info', to: '/about', ability: anybody, group: 'About' },
  { label: 'Our history', icon: 'i-lucide-history', to: '/history', ability: anybody, group: 'About' },
  { label: 'Get involved', icon: 'i-lucide-heart-handshake', to: '/get-involved', ability: anybody, group: 'Join in' },
  { label: 'Technical specification', icon: 'i-lucide-wrench', to: '/technical-specification', ability: anybody, group: 'About' },

  // Module G: training

  { label: 'What we teach', icon: 'i-lucide-graduation-cap', to: '/training/modules', ability: anybody, group: 'Join in' },

  // Module J: governance

  // Policy pages, whose numbers are the live settings rather than prose about them (0012, J-110).
  { label: 'Tickets and refunds', icon: 'i-lucide-receipt', to: '/policies/booking', ability: anybody, group: 'Visit' },
  { label: 'Room booking policy', icon: 'i-lucide-calendar-check', to: '/policies/rooms', ability: anybody, group: 'Visit' },
]

// The few destinations a visitor arrives looking for, in the mockup's order; the rest of
// PUBLIC_NAV stays in the footer. Derived, so a header link cannot disagree with the footer (0040).
const HEADER_ORDER = ['/whats-on', '/get-involved', '/about']

export const HEADER_NAV: NavEntry[] = HEADER_ORDER.flatMap(to => PUBLIC_NAV.filter(entry => entry.to === to))

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
