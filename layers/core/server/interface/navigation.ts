// What the shells show and what the guard allows come from one place: the navigation entries that
// modules which are switched on contribute, plus a settings page generated for each module that
// has settings. The menu and the guard agree because they read the same declaration.
import { can, usePoint, type Actor, type Decision } from '#kit'
import { shows } from './counts'
import { enabledModules } from '#kit/modules-store'
import { useRegistry } from '#kit/registry'
import {
  ADMIN_GROUP_ORDER, abilityList, entryLabelKey, groupLabelKey, orderGroups,
  type NavGroup, type NavItem, type NavigationEntry, type NavigationGroupDecl, type ShellName,
} from '../../shared/navigation'

export interface DeclaredEntry extends NavigationEntry {
  module: string
  /** A label key of its own, for entries the platform generates. */
  label?: string
  /** The entry's count for this viewer, when it has one. */
  countValue?: number
}

/** Core's own screens (modules, settings, jobs, credentials, health, audit) sit in the System group. */
export const SYSTEM_GROUP = 'system'

/** Where the site's own settings are shown (R-33): every setting declared with scope 'site'. */
export const SITE_SETTINGS_PATH = '/admin/settings'

/**
 * Every entry of every module that is on, plus a generated settings entry for each module with
 * settings of its own and one Site administration entry for the site's settings.
 */
export async function declaredEntries(): Promise<DeclaredEntry[]> {
  const out: DeclaredEntry[] = []
  for (const c of await usePoint<NavigationEntry>('core.navigation')) out.push({ ...c.value, module: c.module })
  const on = await enabledModules()
  const changers = new Map<string, Set<string>>()
  const siteChangers = new Set<string>()
  for (const { module, entry } of useRegistry().settings.values()) {
    if (!on.has(module)) continue
    if (entry.scope === 'site') siteChangers.add(entry.change)
    else changers.set(module, (changers.get(module) ?? new Set()).add(entry.change))
  }
  if (siteChangers.size) {
    out.push({ id: 'core.site-settings', module: 'core', label: 'core.settings-page.site-title', menu: 'admin', group: 'modules', to: SITE_SETTINGS_PATH, icon: 'i-lucide-settings-2', ability: [...siteChangers], order: 20 }) // not-policy: after Modules
  }
  for (const [module, abilities] of changers) {
    // A module's settings page sits in the set-up half of the module's own group.
    const own = out.find(e => e.module === module && e.menu === 'console' && e.group)?.group
    out.push({
      id: `${module}.settings`,
      module,
      label: `${module}.module.name`,
      menu: 'console',
      to: `/console/${module}/settings`,
      icon: 'i-lucide-settings-2',
      ability: [...abilities],
      group: own ?? module,
      section: 'setup',
      order: 100, // not-policy: sort position, after the module's own entries
    })
  }
  return out
}

export async function declaredGroups(): Promise<(NavigationGroupDecl & { module: string })[]> {
  const groups = await usePoint<NavigationGroupDecl>('core.navigation-group')
  return groups.map(g => ({ ...g.value, module: g.module }))
}

/** Holding an ability, even if a fresh sign-in is still needed to use it: enough to be shown the way. */
export function holds(decision: Decision): boolean {
  return decision.allowed || decision.code === 'core.access.not-fresh' || decision.code === 'core.access.needs-strong-sign-in'
}

/** Whether the actor holds any of the abilities. An entry with none (account entries) needs only a sign-in. */
export async function mayOpen(actor: Actor, entry: Pick<NavigationEntry, 'ability'>): Promise<Decision> {
  const abilities = abilityList(entry.ability)
  if (!abilities.length) return can(actor, 'signed-in')
  let first: Decision | undefined
  for (const ability of abilities) {
    const decision = await can(actor, ability as never)
    if (decision.allowed || holds(decision)) return decision
    first ??= decision
  }
  return first!
}

export async function allowedEntries(actor: Actor, shell: ShellName): Promise<DeclaredEntry[]> {
  const out: DeclaredEntry[] = []
  for (const entry of await declaredEntries()) {
    if (entry.menu !== shell) continue
    if (!holds(await mayOpen(actor, entry))) continue
    // Hiding an empty entry is tidiness: the address still opens (the guard does not look at counts).
    const { show, value } = await shows(entry, actor)
    if (show) out.push({ ...entry, countValue: value })
  }
  return out
}

const byOrder = (a: NavItem, b: NavItem) => a.order - b.order || a.id.localeCompare(b.id)

function item(entry: DeclaredEntry): NavItem {
  return { id: entry.id, label: entry.label ?? entryLabelKey(entry.id), to: entry.to, icon: entry.icon, match: entry.match, count: entry.countValue, order: entry.order ?? 0 }
}

/** The flat list for a shell without groups, or the grouped sidebar for the console. */
export async function navigationFor(actor: Actor, shell: ShellName): Promise<{ items: NavItem[], groups: NavGroup[] }> {
  const entries = await allowedEntries(actor, shell)
  // The console and Site administration are grouped; the others are flat lists.
  if (shell !== 'console' && shell !== 'admin') return { items: entries.map(item).sort(byOrder), groups: [] }
  const declared = (await declaredGroups()).filter(g => (g.menu ?? 'console') === shell)
  // Site administration's Overview is the shell's home and sits in no group.
  const grouped = shell === 'admin' ? entries.filter(e => e.group) : entries
  const used = [...new Set(grouped.map(e => e.group ?? e.module))]
  const groups: NavGroup[] = []
  const placed = orderGroups(used.map((id) => {
    const decl = declared.find(g => g.id === id)
    return { id, order: decl?.order, before: decl?.before, after: decl?.after }
  }), shell === 'admin' ? ADMIN_GROUP_ORDER : undefined)
  for (const { id } of placed) {
    const decl = declared.find(g => g.id === id)
    const members = grouped.filter(e => (e.group ?? e.module) === id)
    groups.push({
      id,
      label: groupLabelKey(decl?.module ?? members[0]?.module ?? 'core', id),
      icon: decl?.icon ?? 'i-lucide-folder',
      everyday: members.filter(e => (e.section ?? 'everyday') === 'everyday').map(item).sort(byOrder),
      setup: members.filter(e => e.section === 'setup').map(item).sort(byOrder),
    })
  }
  return { items: [], groups }
}
