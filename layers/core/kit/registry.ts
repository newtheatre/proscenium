// The registry: every module's manifest and handler files, collected by the build into
// .generated/registry.ts and checked here across modules (F-02).
import { DeclarationError } from './refusal'
import { DELIVERABLE, snake, type ModuleManifest, type SettingPlace, type EventDecl, type JobDecl, type TaskDecl, type CallDecl, type PointDecl, type SigningDecl } from './manifest'
import { tableMeta, type TableMeta } from './db'
import type { ListSource } from './lists'
import type { SettingEntry, SettingRule } from './settings'
import { impliedAbility, type AbilityDecl, type FactDecl, type RecordDecl } from './abilities'
import type { ModuleHandlers } from './handlers'
import { setPersonalFields } from './log'

/**
 * Module ids the design has reserved (Formats tab). `uses` may name one before it is written; a
 * `uses` on an absent module contributes nothing.
 */
/** Every settled module id, built or not (Foundations part 4, under the module table). A `uses` naming one with no module present is satisfied as absent; a `requires` is not. */
export const RESERVED_MODULE_IDS: readonly string[] = ['core', 'box-office', 'payments', 'finance', 'forms', 'front-of-house', 'spaces', 'bar', 'training', 'membership', 'membership-fees', 'communications', 'public-site']

export type Owner = 'upstream' | 'site' | 'fixtures'

export interface ModuleEntry {
  manifest: ModuleManifest
  /** The module's folder, relative to the repository: layers/core, site/layers/x-raffle. */
  root: string
  owner: Owner
  handlers: ModuleHandlers
}

export interface Registry {
  modules: Map<string, ModuleEntry>
  settings: Map<string, { module: string, entry: SettingEntry }>
  settingRules: Map<string, SettingRule[]>
  /**
   * The generated pages of settings, by id `<module>.<page>`: every declared page, the shared
   * Advanced page (`core.advanced`), and a module's own page (`<module>.settings` in the console,
   * `<module>.admin` in Admin) where one of its groups uses it.
   */
  settingPages: Map<string, SettingPage>
  /** Where each setting is shown: on exactly one generated page, or on one bespoke screen. */
  settingHomes: Map<string, SettingHome>
  /** Renamed settings: the old key, which still answers for one major version, to its new key. */
  settingAliases: Map<string, string>
  abilities: Map<string, { module: string, decl: AbilityDecl }>
  records: Map<string, { module: string, decl: RecordDecl }>
  facts: Map<string, { module: string, decl: FactDecl }>
  tables: Map<string, { module: string, table: any, meta: TableMeta }>
  prefixes: Map<string, string>
  events: Map<string, { module: string, decl: EventDecl }>
  listeners: Map<string, { module: string, listener: string, deliverable?: true }[]>
  jobs: Map<string, { module: string, decl: JobDecl }>
  tasks: Map<string, { module: string, decl: TaskDecl }>
  calls: Map<string, { module: string, decl: CallDecl }>
  points: Map<string, { module: string, decl: PointDecl }>
  /** Signing purposes (F-37), by purpose. */
  signing: Map<string, { module: string, decl: SigningDecl }>
  /** List sources by list id (server/lists/<name>.ts). */
  lists: Map<string, { module: string, source: ListSource }>
}

export interface SettingPage {
  module: string
  place: SettingPlace
  /** The navigation group the page sits in; a module's own console page uses the module's group. */
  group?: string
  order: number
  icon: string
  to: string
  /** The translation key of the page's name. */
  label: string
}
export type SettingHome = { page: string, screen?: undefined } | { screen: string, page?: undefined }

/** The shared page of engineering limits, under Upkeep in Admin. */
export const ADVANCED_PAGE = 'core.advanced'
const DEFAULT_PAGE = { console: 'settings', admin: 'admin' } as const
const SETTINGS_ICON = 'i-lucide-settings-2'

/** The events, jobs and tasks of the core itself are always present, so other modules may name them. */
export function buildRegistry(entries: ModuleEntry[]): Registry {
  const r: Registry = {
    modules: new Map(), settings: new Map(), settingRules: new Map(), settingPages: new Map(), settingHomes: new Map(), settingAliases: new Map(), abilities: new Map(), records: new Map(), facts: new Map(),
    tables: new Map(), prefixes: new Map(), events: new Map(), listeners: new Map(), jobs: new Map(), tasks: new Map(), calls: new Map(), points: new Map(), signing: new Map(), lists: new Map(),
  }
  const fail = (entry: ModuleEntry, field: string, message: string): never => {
    throw new DeclarationError(field, message, `${entry.root}/module.ts`)
  }

  for (const entry of entries) {
    const m = entry.manifest
    const folder = entry.root.split('/').pop()!
    if (m.id !== folder) fail(entry, 'id', `is "${m.id}" but the folder is "${folder}": they must match`)
    if (r.modules.has(m.id)) fail(entry, 'id', `"${m.id}" is declared twice`)
    if (m.id === 'core' && entry.root !== 'layers/core') fail(entry, 'id', 'only layers/core may be the core')
    if (entry.owner === 'site' && !m.id.startsWith('x-')) fail(entry, 'id', "a theatre's own module starts with x-")
    if (entry.owner === 'upstream' && m.id.startsWith('x-')) fail(entry, 'id', 'x- is reserved for a theatre\'s own modules')
    r.modules.set(m.id, entry)
  }

  const add = <V>(map: Map<string, V>, entry: ModuleEntry, field: string, key: string, value: V) => {
    if (map.has(key)) fail(entry, `${field}.${key}`, 'is declared twice')
    map.set(key, value)
  }

  for (const entry of entries) {
    const m = entry.manifest
    const id = m.id
    for (const [key, setting] of Object.entries(m.settings ?? {})) add(r.settings, entry, 'settings', key, { module: id, entry: setting })
    if (m.settingRules) r.settingRules.set(id, m.settingRules.rules)
    for (const [key, decl] of Object.entries(m.abilities ?? {})) add(r.abilities, entry, 'abilities', key, { module: id, decl })
    for (const [key, decl] of Object.entries(m.records ?? {})) add(r.records, entry, 'records', key, { module: id, decl })
    for (const [key, decl] of Object.entries(m.facts ?? {})) add(r.facts, entry, 'facts', key, { module: id, decl })
    for (const [key, table] of Object.entries(m.tables ?? {})) {
      const meta = tableMeta(table)!
      add(r.tables, entry, 'tables', meta.name, { module: id, table, meta })
      const prefix = meta.options.id
      if (prefix) {
        const holder = r.prefixes.get(prefix)
        if (holder) fail(entry, `tables.${key}.id`, `the prefix "${prefix}" is already used by ${holder}`)
        if (entry.owner === 'site' ? !prefix.startsWith('x') : prefix.startsWith('x')) fail(entry, `tables.${key}.id`, entry.owner === 'site' ? "a theatre's own prefixes start with x" : "prefixes starting with x belong to a theatre's own modules")
        r.prefixes.set(prefix, meta.name)
      }
    }
    for (const [key, decl] of Object.entries(m.events?.announces ?? {})) add(r.events, entry, 'events.announces', key, { module: id, decl })
    for (const [key, decl] of Object.entries(m.jobs ?? {})) add(r.jobs, entry, 'jobs', key, { module: id, decl })
    for (const [key, decl] of Object.entries(m.tasks ?? {})) add(r.tasks, entry, 'tasks', key, { module: id, decl })
    for (const [key, decl] of Object.entries(m.calls ?? {})) add(r.calls, entry, 'calls', key, { module: id, decl })
    for (const decl of m.signing ?? []) add(r.signing, entry, 'signing', decl.purpose, { module: id, decl })
    for (const [key, decl] of Object.entries(m.points ?? {})) add(r.points, entry, 'points', key, { module: id, decl })
  }

  for (const entry of entries) {
    const m = entry.manifest
    const linked = new Set(['core', m.id, ...(m.requires ?? []), ...(m.uses ?? [])])
    for (const other of m.requires ?? []) if (!r.modules.has(other)) fail(entry, 'requires', `"${other}" is not a module in this repository`)
    for (const other of m.uses ?? []) if (!r.modules.has(other) && !RESERVED_MODULE_IDS.includes(other)) fail(entry, 'uses', `"${other}" is neither a module in this repository nor an id the design has reserved`)
    for (const other of m.requires ?? []) {
      if (entry.owner === 'upstream' && r.modules.get(other)!.owner === 'site') fail(entry, 'requires', `upstream never depends on a theatre's module (${other})`)
    }
    const absent = (name: string) => {
      const owner = name.split('.')[0]!
      return !!m.uses?.includes(owner) && !r.modules.has(owner)
    }
    for (const [event, listener] of Object.entries(m.events?.listens ?? {})) {
      if (event === DELIVERABLE) {
        if (!entry.handlers.listeners?.[listener]) fail(entry, `events.listens.${event}`, `the listener file ${entry.root}/server/listeners/${listener}.ts does not exist`)
        // It hears every event any module may announce that is not internal (Formats tab).
        for (const [name, announced] of r.events) {
          if (announced.decl.internal) continue
          const list = r.listeners.get(name) ?? []
          list.push({ module: m.id, listener, deliverable: true })
          r.listeners.set(name, list)
        }
        continue
      }
      if (absent(event)) continue
      const announced = r.events.get(event)
      if (!announced) fail(entry, `events.listens.${event}`, 'no module announces this event')
      if (!linked.has(announced!.module)) fail(entry, `events.listens.${event}`, `${announced!.module} announces it, so list ${announced!.module} in requires or uses`)
      if (!entry.handlers.listeners?.[listener]) fail(entry, `events.listens.${event}`, `the listener file ${entry.root}/server/listeners/${listener}.ts does not exist`)
      const list = r.listeners.get(event) ?? []
      list.push({ module: m.id, listener })
      r.listeners.set(event, list)
    }
    for (const [file, value] of Object.entries(entry.handlers.lists ?? {})) {
      const source = value as ListSource | undefined
      const where = `${entry.root}/server/lists/${short(file)}.ts`
      if (!source?.list?.id || !source.table) throw new DeclarationError('default', 'is not a list source made with defineListSource', where)
      if (!source.list.id.startsWith(`${m.id}.`)) throw new DeclarationError('list', `"${source.list.id}" is not named under ${m.id}.`, where)
      if (r.lists.has(source.list.id)) throw new DeclarationError('list', `"${source.list.id}" has two sources`, where)
      r.lists.set(source.list.id, { module: m.id, source })
    }
    for (const name of Object.keys(m.jobs ?? {})) if (!entry.handlers.jobs?.[name]) fail(entry, `jobs.${name}`, `the handler ${entry.root}/server/jobs/${short(name)}.ts does not exist`)
    for (const name of Object.keys(m.tasks ?? {})) if (!entry.handlers.tasks?.[name]) fail(entry, `tasks.${name}`, `the handler ${entry.root}/server/tasks/${short(name)}.ts does not exist`)
    for (const name of Object.keys(m.facts ?? {})) if (!entry.handlers.facts?.[name]) fail(entry, `facts.${name}`, `the resolver ${entry.root}/server/facts/${short(name)}.ts does not exist`)
    for (const name of Object.keys(m.calls ?? {})) {
      const handler = entry.handlers.calls?.[name]
      if (!handler || typeof handler.reconcile !== 'function' || typeof handler.outcome !== 'function') fail(entry, `calls.${name}`, `${entry.root}/server/calls/${short(name)}.ts must export defineCall({ outcome, reconcile })`)
    }
    for (const [name, list] of Object.entries(m.contributes ?? {})) {
      if (absent(name)) continue
      const declared = r.points.get(name)
      if (!declared) fail(entry, `contributes.${name}`, 'no module declares this point')
      if (!linked.has(declared!.module)) fail(entry, `contributes.${name}`, `${declared!.module} owns this point, so list it in requires or uses`)
      for (const c of list) {
        if (declared!.decl.kind === 'data') {
          const parsed = declared!.decl.schema.safeParse(c)
          if (!parsed.success) fail(entry, `contributes.${name}.${c.id}`, parsed.error.issues.map(i => `${i.path.join('.') || '(entry)'}: ${i.message}`).join('; '))
        }
        else if (!entry.handlers.contributions?.[name]?.[c.file ?? c.id]) {
          fail(entry, `contributes.${name}.${c.id}`, `the file ${entry.root}/server/contributions/${name}/${c.file ?? c.id}.ts does not exist`)
        }
      }
    }
    placeSettings(r, entry, fail)
    for (const [name, decl] of Object.entries(m.credentials ?? {})) {
      if (!decl.manage) continue
      // Saving a key asks for a fresh sign-in, which a privileged ability brings.
      if (!r.abilities.has(decl.manage)) fail(entry, `credentials.${name}.manage`, `"${decl.manage}" is not a declared ability`)
      else if (r.abilities.get(decl.manage)!.decl.risk !== 'privileged') fail(entry, `credentials.${name}.manage`, `"${decl.manage}" is not privileged, and a key is managed only under a privileged ability`)
    }
    for (const [key, setting] of Object.entries(m.settings ?? {})) {
      if (!r.abilities.has(setting.change)) fail(entry, `settings.${key}.change`, `"${setting.change}" is not a declared ability`)
      if (setting.kind === 'reference' && !r.records.has(setting.record!)) fail(entry, `settings.${key}.record`, `"${setting.record}" is not a record type`)
    }
    for (const [key, { decl }] of [...r.abilities].filter(([, a]) => a.module === m.id)) {
      if (decl.on && !r.records.has(decl.on)) fail(entry, `abilities.${key}.on`, `"${decl.on}" is not a record type`)
      // Another module's ability may come with this one only when that module says it may, it is of
      // risk normal, and its owner is core or a module this one requires, never one it only uses.
      for (const implied of decl.implies ?? []) {
        const full = impliedAbility(m.id, implied)
        if (full === `${m.id}.${implied}`) continue
        const target = r.abilities.get(full)
        if (!target) fail(entry, `abilities.${key}.implies`, `"${full}" is not a declared ability`)
        else if (target.module !== 'core' && !(m.requires ?? []).includes(target.module)) fail(entry, `abilities.${key}.implies`, `${target.module} owns "${full}", so list it in requires (uses is not enough)`)
        else if (!target.decl.impliable) fail(entry, `abilities.${key}.implies`, `"${full}" does not declare impliable: true`)
        else if (target.decl.risk === 'privileged') fail(entry, `abilities.${key}.implies`, `"${full}" is privileged, and only an ability of risk normal may be implied by another module`)
      }
      if (decl.owner && decl.owner !== 'ignored') {
        const rec = decl.on ? r.records.get(decl.on) : undefined
        if (!rec?.decl.owner) fail(entry, `abilities.${key}.owner`, `owner: '${decl.owner}' needs a record type that declares an owner column`)
      }
    }
    for (const [key, { decl }] of [...r.records].filter(([, a]) => a.module === m.id)) {
      if (decl.parent && !r.records.has(decl.parent)) fail(entry, `records.${key}.parent`, `"${decl.parent}" is not a record type`)
      if (decl.table === undefined) {
        if (!Array.isArray(decl.ids) || !decl.ids.length || !decl.ids.every(i => /^[a-z][a-z0-9-]*$/.test(i))) fail(entry, `records.${key}.ids`, 'a record type without a table lists its fixed ids, kebab-case')
        if (decl.owner) fail(entry, `records.${key}.owner`, 'a record type without a table has no owner column')
        continue
      }
      const table = r.tables.get(decl.table)
      if (!table) fail(entry, `records.${key}.table`, `"${decl.table}" is not a declared table`)
      if (decl.owner && !Object.values(table!.meta.columns).some(c => c.sql === decl.owner)) fail(entry, `records.${key}.owner`, `"${decl.owner}" is not a column of ${decl.table}`)
    }
    for (const [key, { decl }] of [...r.facts].filter(([, a]) => a.module === m.id)) {
      if (decl.on && !r.records.has(decl.on)) fail(entry, `facts.${key}.on`, `"${decl.on}" is not a record type`)
    }
    for (const [key, table] of Object.entries(m.tables ?? {})) {
      const meta = tableMeta(table)!
      for (const [col, { meta: c }] of Object.entries(meta.columns)) {
        if (c.ref) {
          const target = r.tables.get(c.ref.table)
          if (!target) fail(entry, `tables.${key}.${col}`, `references "${c.ref.table}", which no module declares`)
          if (!linked.has(target!.module)) fail(entry, `tables.${key}.${col}`, `${target!.module} owns ${c.ref.table}, so list it in requires`)
        }
        if (c.erase === 'retain' && !r.settings.has(c.until!)) fail(entry, `tables.${key}.${col}`, `retain until "${c.until}", which is not a setting`)
        if (c.erase === 'retain') confirmsRetention(r.settings.get(c.until!)!.entry)
      }
      if (typeof meta.options.retention === 'string' && r.settings.get(meta.options.retention)?.entry.kind !== 'duration') fail(entry, `tables.${key}.retention`, `"${meta.options.retention}" is not a duration setting`)
      if (typeof meta.options.retention === 'string') confirmsRetention(r.settings.get(meta.options.retention)!.entry)
      // An internal column that erasure clears needs rows erasure can find: a subject of its own, or
      // a chain of parents (subject { via }) that ends at an account or an email.
      const clears = Object.entries(meta.columns).find(([, c]) => c.meta.class === 'internal' && c.meta.erase === 'clear')
      if (clears && !reachesPerson(meta, r)) fail(entry, `tables.${key}.${clears[0]}`, `erase: 'clear' needs rows that reach a person, and ${meta.name}'s subject does not lead to an account or an email`)
    }
  }

  // requires may not form a loop.
  const visiting = new Set<string>()
  const done = new Set<string>()
  const visit = (id: string, path: string[]) => {
    if (done.has(id)) return
    if (visiting.has(id)) {
      const entry = r.modules.get(path[0]!)!
      fail(entry, 'requires', `forms a loop: ${[...path, id].join(' → ')}`)
    }
    visiting.add(id)
    for (const next of r.modules.get(id)?.manifest.requires ?? []) visit(next, [...path, id])
    visiting.delete(id)
    done.add(id)
  }
  for (const id of r.modules.keys()) visit(id, [])
  return r
}

/** The part of a job, task or call name after the module: `box-office.sweep-holds` → `sweep-holds`. */
export function short(name: string): string {
  return name.slice(name.indexOf('.') + 1)
}

/** The module that owns a table name, by its prefix. */
export function moduleOfTable(name: string): string {
  return name.split('_')[0]!
}

let installed: Registry | undefined

/** Installs the registry the running Worker uses: the generated one, or a test's. */
export function installRegistry(registry: Registry): Registry {
  installed = registry
  const personal = new Set<string>()
  for (const { meta } of registry.tables.values()) {
    for (const [key, { sql, meta: column }] of Object.entries(meta.columns)) {
      if (column.class === 'personal' || column.class === 'freeText' || column.class === 'special') personal.add(key).add(sql)
    }
  }
  setPersonalFields(personal)
  return registry
}

export function useRegistry(): Registry {
  if (!installed) throw new Error('No registry installed. The core layer\'s server plugin installs the generated one; a test calls installRegistry().')
  return installed
}

export { snake }

/** Whether a table's rows lead to a person: an account or email subject, through any parents. */
function reachesPerson(meta: TableMeta, r: Registry, seen = new Set<string>()): boolean {
  if (seen.has(meta.name)) return false
  seen.add(meta.name)
  const subject = meta.options.subject
  if (subject === 'none') return false
  if (meta.subjects.length || typeof subject === 'string' || Array.isArray(subject)) return true
  if (subject && typeof subject === 'object' && ('email' in subject || 'account' in subject)) return true
  if (subject && typeof subject === 'object' && 'via' in subject) {
    const via = Object.values(meta.columns).find(c => c.sql === subject.via)
    const parent = via?.meta.ref ? r.tables.get(via.meta.ref.table)?.meta : undefined
    return !!parent && reachesPerson(parent, r, seen)
  }
  return false
}

/** Declares a module's pages of settings and gives each of its settings its one home. */
function placeSettings(r: Registry, entry: ModuleEntry, fail: (entry: ModuleEntry, field: string, message: string) => never): void {
  const m = entry.manifest
  const id = m.id
  const addPage = (pageId: string, page: SettingPage, field: string) => {
    if (r.settingPages.has(pageId)) fail(entry, field, `the page ${pageId} is declared twice`)
    for (const [other, { to }] of r.settingPages) if (to === page.to) fail(entry, field, `${page.to} is already the address of ${other}`)
    r.settingPages.set(pageId, page)
  }
  if (id === 'core') addPage(ADVANCED_PAGE, { module: 'core', place: 'admin', group: 'upkeep', order: 90, icon: 'i-lucide-sliders-horizontal', to: '/admin/advanced', label: 'core.settings-pages.advanced' }, 'settingPages.advanced') // not-policy: last in Upkeep
  for (const [page, decl] of Object.entries(m.settingPages ?? {})) {
    if (Object.values(DEFAULT_PAGE).includes(page as never) || page === 'about' || (id === 'core' && page === 'advanced')) fail(entry, `settingPages.${page}`, `"${page}" is a page the platform makes itself`)
    const to = decl.to ?? (id === 'core'
      ? (decl.place === 'admin' ? `/admin/${page}` : `/console/${page}/settings`)
      : (decl.place === 'admin' ? `/admin/modules/${id}/${page}` : `/console/${id}/settings/${page}`))
    addPage(`${id}.${page}`, { module: id, place: decl.place, group: decl.group, order: decl.order ?? 100, icon: decl.icon ?? SETTINGS_ICON, to, label: `${id}.settings-pages.${page}` }, `settingPages.${page}`) // not-policy: sort position
  }
  for (const [key, setting] of Object.entries(m.settings ?? {})) {
    const group = key.slice(id.length + 1).split('.')[0]!
    const decl = m.settingGroups?.[group]
    let home: SettingHome
    if (setting.screen ?? decl?.screen) home = { screen: (setting.screen ?? decl!.screen)! }
    else if (decl?.advanced) home = { page: ADVANCED_PAGE }
    else if (decl?.page) home = { page: `${id}.${decl.page}` }
    else {
      // A module's own page is a tab on its page in Admin's Modules unless the group asks for the console.
      const place = decl?.place ?? 'admin'
      const pageId = `${id}.${DEFAULT_PAGE[place]}`
      if (!r.settingPages.has(pageId)) {
        addPage(pageId, place === 'console'
          ? { module: id, place, order: 100, icon: SETTINGS_ICON, to: `/console/${id}/settings`, label: `${id}.module.name` } // not-policy: after the module's own entries
          : { module: id, place, group: 'modules', order: 100, icon: SETTINGS_ICON, to: `/admin/modules/${id}`, label: `${id}.module.name` }, `settingGroups.${group}`) // not-policy: sort position
      }
      home = { page: pageId }
    }
    r.settingHomes.set(key, home)
    if (setting.replaces !== undefined) {
      if (typeof setting.replaces !== 'string' || !setting.replaces.startsWith(`${id}.`) || setting.replaces.split('.').length !== 3) fail(entry, `settings.${key}.replaces`, `names the old key in full, such as ${id}.<group>.<name>`)
      if (r.settings.has(setting.replaces)) fail(entry, `settings.${key}.replaces`, `${setting.replaces} is still declared; a renamed key is declared only under its new name`)
      if (r.settingAliases.has(setting.replaces)) fail(entry, `settings.${key}.replaces`, `${setting.replaces} is already replaced by ${r.settingAliases.get(setting.replaces)}`)
      r.settingAliases.set(setting.replaces, key)
    }
  }
}

/**
 * A setting a table's retention names is a retention period, and shortening one lets the next sweep
 * remove rows for good, so it always confirms (Settings registry, "A retention period always
 * confirms"): onChange 'confirm' whatever the manifest says, unless it asks for a reason, which is
 * stronger.
 */
function confirmsRetention(entry: SettingEntry): void {
  if (entry.onChange !== 'reason') entry.onChange = 'confirm'
}
