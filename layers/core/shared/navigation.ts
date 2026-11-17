// What the shells share with the server: the shell prefixes, the fixed order of console groups
// and the one rule that turns an address into a navigation entry. Pure, so it runs anywhere.

export type ShellName = 'account' | 'members' | 'console' | 'admin' | 'live'

/** The prefix each shell owns. Everything else belongs to the theatre's own pages. */
export const SHELL_PREFIXES: Record<ShellName, string> = {
  account: '/account',
  members: '/members',
  console: '/console',
  admin: '/admin',
  live: '/live',
}

/** The console's groups in the fixed order that does not vary by viewer. */
export const CONSOLE_GROUP_ORDER = [
  'tonight', 'programme', 'box-office', 'front-of-house', 'bar', 'venues', 'spaces', 'training', 'membership',
  'people', 'money', 'communications', 'forms', 'reports', 'system',
] as const

/** Admin's groups (R-33), in their fixed order. Every admin entry but the Overview names one. */
export const ADMIN_GROUP_ORDER = ['theatre', 'modules', 'access', 'email', 'connections', 'upkeep'] as const

/**
 * My account's groups, in their fixed order: the person's life at the theatre (bookings,
 * membership, the access scheme, credits) before the account's own upkeep. An account entry that
 * names no group sits at the theatre, since that is what a module adds.
 */
export const ACCOUNT_GROUP_ORDER = ['theatre', 'account'] as const
export type AccountGroup = typeof ACCOUNT_GROUP_ORDER[number]

export interface NavigationEntry {
  id: string
  /** Which of the four shells, or live mode, shows it. */
  menu: ShellName
  to: string
  icon: string
  ability?: string | string[]
  order?: number
  group?: string
  section?: 'everyday' | 'setup'
  count?: string
  /** Hide the entry while its count is zero (needs count; a count not yet loaded counts as zero). */
  hideEmpty?: boolean
  /** A count of things that need the person (an address to confirm): above zero, the entry is marked. */
  attention?: string
  match?: string
  /** A tab of a module's page in Admin: the console entries or groups whose settings window shows it. */
  settingsIn?: string[]
}

export interface NavigationGroupDecl {
  id: string
  /** The console's groups by default; 'admin' for Admin's. */
  menu?: 'console' | 'admin'
  order?: number
  icon: string
  before?: string
  after?: string
}

/** What a shell draws: one entry, labelled by a translation key derived from its id. */
export interface NavItem {
  id: string
  label: string
  to: string
  icon: string
  match?: string
  /** The number shown beside the label: the count for this viewer. */
  count?: number
  /** How many things under the entry need the person; shown as a warning, not a tally. */
  attention?: number
  /** The entry's group, for a flat menu drawn in groups (My account's). */
  group?: string
  order: number
  /** The module the entry belongs to: the console's cog opens that module's settings. */
  module?: string
}

export interface NavGroup {
  id: string
  label: string
  icon: string
  everyday: NavItem[]
  setup: NavItem[]
}

/** The address of a module's page in Admin; its settings, set-up screens and About are tabs below it. */
export const moduleHome = (module: string) => `/admin/modules/${module}`

/**
 * The module whose page in Admin an entry is a tab of, or undefined. An admin entry at or below
 * /admin/modules/<module> is drawn as a tab on that module's page, not in the sidebar.
 */
export function moduleTabOf(entry: { menu: string, to: string }): string | undefined {
  if (entry.menu !== 'admin') return undefined
  return /^\/admin\/modules\/([a-z][a-z0-9-]*)(?:\/|$)/.exec(entry.to)?.[1]
}

/** The shell an address belongs to, or undefined for a theatre's own page. */
export function shellOf(path: string): ShellName | undefined {
  const clean = path.split(/[?#]/)[0] ?? ''
  for (const [shell, prefix] of Object.entries(SHELL_PREFIXES) as [ShellName, string][]) {
    if (clean === prefix || clean.startsWith(`${prefix}/`)) return shell
  }
  return undefined
}

function covers(prefix: string, path: string): boolean {
  const p = prefix.length > 1 ? prefix.replace(/\/$/, '') : prefix
  return path === p || path.startsWith(`${p}/`)
}

/** The entry whose address or `match` prefix covers `path`, preferring the longest. */
export function resolveEntry<E extends { to: string, match?: string }>(entries: readonly E[], path: string): E | undefined {
  const clean = (path.split(/[?#]/)[0] ?? '').replace(/(?<=.)\/$/, '')
  let best: E | undefined
  let length = -1
  for (const entry of entries) {
    for (const prefix of [entry.to, entry.match]) {
      if (prefix && covers(prefix, clean) && prefix.length > length) {
        best = entry
        length = prefix.length
      }
    }
  }
  return best
}

/** The label key a module's navigation entry or group is translated through. */
export function entryLabelKey(id: string): string {
  const dot = id.indexOf('.')
  return `${id.slice(0, dot)}.navigation.${id.slice(dot + 1)}.label`
}

export function groupLabelKey(module: string, id: string): string {
  return `${module}.navigation.groups.${id}.label`
}

export function abilityList(ability: string | string[] | undefined): string[] {
  return ability === undefined ? [] : Array.isArray(ability) ? ability : [ability]
}

/**
 * Puts groups in order: the platform's fixed order first, a theatre's own groups where `before` or
 * `after` places them (at the end otherwise), then each group's entries by `order`.
 */
export function orderGroups<G extends { id: string, order?: number, before?: string, after?: string }>(groups: readonly G[], order: readonly string[] = CONSOLE_GROUP_ORDER): G[] {
  const fixed = new Map(order.map((id, i) => [id, i * 10] as const))
  // Every platform group has a place, whether or not this viewer has any entry in it, so a theatre's
  // own group can be placed before or after one that is absent here.
  const position = new Map<string, number>(fixed as Map<string, number>)
  const rest = groups.filter(g => !fixed.has(g.id as never))
  let guard = rest.length + 1
  while (rest.length && guard-- > 0) {
    for (const g of [...rest]) {
      const anchor = g.before ?? g.after
      const base = anchor ? position.get(anchor) : g.order ?? order.length * 10 + 10
      if (base === undefined) continue
      position.set(g.id, g.before ? base - 5 : g.after ? base + 5 : base)
      rest.splice(rest.indexOf(g), 1)
    }
  }
  for (const g of rest) position.set(g.id, order.length * 10 + 20) // an anchor that does not exist: last
  return [...groups].sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0) || a.id.localeCompare(b.id))
}
