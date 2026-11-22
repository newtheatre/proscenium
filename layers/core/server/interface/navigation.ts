// What the shells show and what the guard allows come from one place: the navigation entries that
// modules which are switched on contribute, plus a settings page generated for each module that
// has settings. The menu and the guard agree because they read the same declaration.
import { can, usePoint, STRONGER_SIGN_IN, type Actor, type Decision } from '#kit'
import { countOf, shows } from './counts'
import { enabledModules } from '#kit/modules-store'
import { useRegistry } from '#kit/registry'
import {
  ADMIN_GROUP_ORDER, abilityList, entryLabelKey, groupLabelKey, moduleHome, moduleTabOf, orderGroups,
  type NavGroup, type NavItem, type NavigationEntry, type NavigationGroupDecl, type ShellName,
} from '../../shared/navigation'

export interface DeclaredEntry extends NavigationEntry {
  module: string
  /** A label key of its own, for entries the platform generates. */
  label?: string
  /** The entry's count for this viewer, when it has one. */
  countValue?: number
  /** How many things under the entry need this viewer, when it counts them. */
  attentionValue?: number
  /** For a generated page of settings, the page's id. */
  settingsPage?: string
}

/** Who may see a module's page in Admin without changing anything on it: its About tab and the catalogue. */
export const MODULE_VIEWERS = ['core.modules.manage', 'core.health.view']

/** Core's own screens (modules, settings, jobs, credentials, health, audit) sit in the System group. */
export const SYSTEM_GROUP = 'system'

/**
 * Every entry of every module that is on, plus one for each page of settings that holds a setting
 * of a module that is on. A page's entry is open to whoever may change one of its settings.
 */
export async function declaredEntries(): Promise<DeclaredEntry[]> {
  const out: DeclaredEntry[] = []
  for (const c of await usePoint<NavigationEntry>('core.navigation')) out.push({ ...c.value, module: c.module })
  const on = await enabledModules()
  const registry = useRegistry()
  const changers = new Map<string, Set<string>>()
  for (const [key, { module, entry }] of registry.settings) {
    const home = registry.settingHomes.get(key)
    if (!on.has(module) || !home?.page) continue
    changers.set(home.page, (changers.get(home.page) ?? new Set()).add(entry.change))
  }
  for (const [pageId, abilities] of changers) {
    const page = registry.settingPages.get(pageId)!
    const group = page.group ?? page.module
    out.push({
      id: `${pageId}-settings`,
      module: page.module,
      label: page.label,
      menu: 'admin',
      to: page.to,
      icon: page.icon,
      ability: [...abilities],
      group,
      order: page.order,
      settingsPage: pageId,
      ...(page.settingsIn ? { settingsIn: [...page.settingsIn] } : {}),
    })
  }
  // Every module's page has an About tab, for a module that is off too (the catalogue opens it).
  for (const id of registry.modules.keys()) {
    out.push({ id: `core.modules.about.${id}`, module: 'core', label: 'core.modules.tab.about', menu: 'admin', group: 'modules', to: `${moduleHome(id)}/about`, icon: 'i-lucide-info', ability: MODULE_VIEWERS, order: 1000 }) // not-policy: About is the last tab
  }
  return out
}

export async function declaredGroups(): Promise<(NavigationGroupDecl & { module: string })[]> {
  const groups = await usePoint<NavigationGroupDecl>('core.navigation-group')
  return groups.map(g => ({ ...g.value, module: g.module }))
}

/** Holding an ability, even if a fresh sign-in is still needed to use it: enough to be shown the way. */
export function holds(decision: Decision): boolean {
  return decision.allowed || decision.code === 'core.access.not-fresh' || (STRONGER_SIGN_IN as readonly string[]).includes(decision.code)
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
    if (!show) continue
    out.push({ ...entry, countValue: value, ...(entry.attention ? { attentionValue: await countOf(entry.attention, actor) } : {}) })
  }
  return out
}

const byOrder = (a: NavItem, b: NavItem) => a.order - b.order || a.id.localeCompare(b.id)

function item(entry: DeclaredEntry): NavItem {
  return {
    id: entry.id, label: entry.label ?? entryLabelKey(entry.id), to: entry.to, icon: entry.icon, match: entry.match, count: entry.countValue, order: entry.order ?? 0, module: entry.module,
    ...(entry.attentionValue ? { attention: entry.attentionValue } : {}),
    ...(entry.unlisted ? { unlisted: true } : {}),
    // My account is drawn in groups; an entry that names none sits at the theatre.
    ...(entry.menu === 'account' ? { group: entry.group ?? 'theatre' } : {}),
  }
}

/** The flat list for a shell without groups, or the grouped sidebar for the console. */
export async function navigationFor(actor: Actor, shell: ShellName): Promise<{ items: NavItem[], groups: NavGroup[] }> {
  const entries = await allowedEntries(actor, shell)
  // The console and Admin are grouped; the others are flat lists.
  if (shell !== 'console' && shell !== 'admin') return { items: entries.map(item).sort(byOrder), groups: [] }
  const declared = (await declaredGroups()).filter(g => (g.menu ?? 'console') === shell)
  // Admin's Overview is the shell's home and sits in no group; a module's tabs are on its page.
  const grouped = shell === 'admin' ? entries.filter(e => e.group && !moduleTabOf(e)) : entries
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

export interface ModuleTab {
  id: string
  /** Translation key of the tab's label. */
  label: string
  to: string
  icon: string
  /** A generated page of settings: its id, which the console's settings window draws in place. */
  page: string | null
}

/**
 * The tabs of a module's page in Admin this viewer may open, in order: its pages of settings and
 * set-up screens, then About. The same tabs, less About, are the console's settings window.
 */
export async function moduleTabs(actor: Actor, module: string): Promise<ModuleTab[]> {
  const tabs: (ModuleTab & { order: number })[] = []
  for (const entry of await declaredEntries()) {
    if (moduleTabOf(entry) !== module) continue
    if (!holds(await mayOpen(actor, entry))) continue
    // The module's own page of settings is its Settings tab; a named page keeps its name.
    const label = entry.settingsPage === `${module}.admin` ? 'core.modules.tab.settings' : entry.label ?? entryLabelKey(entry.id)
    tabs.push({ id: entry.id, label, to: entry.to, icon: entry.icon, page: entry.settingsPage ?? null, order: entry.order ?? 0 })
  }
  // Pages of settings first, then set-up screens, then About.
  const rank = (tab: ModuleTab) => tab.page ? 0 : tab.id.startsWith('core.modules.about.') ? 2 : 1
  return tabs.sort((a, b) => rank(a) - rank(b) || a.order - b.order || a.to.length - b.to.length).map(({ order: _, ...tab }) => tab)
}

export interface SettingsWindow {
  /** Translation key of what the window is named after: a module, or a console group. */
  name: string
  tabs: ModuleTab[]
}

/**
 * The console's settings window for one scope. A console entry id (core.productions) is the cog on
 * that page: the tabs of modules' pages in Admin that name the entry or its group in settingsIn,
 * and, where a tab names nowhere (nor does its module), the tabs of the entry's own module. A
 * module id (an Admin address opened from the console, or a setting found by search) is every tab
 * of that module. About stays in Admin. The window is named after the module when it holds only
 * that module's tabs and the module's console pages sit in one group; otherwise after the group.
 */
export async function settingsWindow(actor: Actor, scope: string): Promise<SettingsWindow | undefined> {
  const registry = useRegistry()
  const notAbout = (tab: ModuleTab) => !tab.id.startsWith('core.modules.about.')
  if (registry.modules.has(scope)) return { name: `${scope}.module.name`, tabs: (await moduleTabs(actor, scope)).filter(notAbout) }
  const entries = await declaredEntries()
  const page = entries.find(e => e.menu === 'console' && e.id === scope)
  if (!page) return undefined
  const group = page.group ?? page.module
  const places = (entry: DeclaredEntry) => entry.settingsIn ?? registry.modules.get(entry.module)?.manifest.settingsIn
  const shown = (entry: DeclaredEntry) => {
    const named = places(entry)
    return named ? named.includes(page.id) || named.includes(group) : entry.module === page.module
  }
  const modules = [...new Set(entries.filter(e => moduleTabOf(e) && !e.id.startsWith('core.modules.about.') && shown(e)).map(e => moduleTabOf(e)!))]
  // The page's own module first, then the others in the order their tabs were declared.
  modules.sort((a, b) => Number(b === page.module) - Number(a === page.module))
  const tabs: ModuleTab[] = []
  for (const module of modules) {
    for (const tab of await moduleTabs(actor, module)) {
      const entry = entries.find(e => e.id === tab.id)
      if (!entry || !notAbout(tab) || !shown(entry)) continue
      // Another module's own Settings tab is named after that module.
      tabs.push(module !== page.module && tab.page === `${module}.admin` ? { ...tab, label: `${module}.module.name` } : tab)
    }
  }
  const groupsOfModule = new Set(entries.filter(e => e.module === page.module && e.menu === 'console').map(e => e.group ?? e.module))
  const own = modules.every(m => m === page.module) && groupsOfModule.size === 1
  const decl = (await declaredGroups()).find(g => g.id === group && (g.menu ?? 'console') === 'console')
  return { name: own ? `${page.module}.module.name` : groupLabelKey(decl?.module ?? page.module, group), tabs }
}
