// Checks that read the source: imports, bindings, outside calls, announced events and queued jobs,
// content tokens, translations, abilities nobody requires, and numbers that should be settings.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, rel } from '../lib/paths.ts'
import type { Loaded } from '../lib/load.ts'
import { allRoutes } from './routes.ts'
import { abilityList, entryLabelKey, groupLabelKey, resolveEntry, SHELL_PREFIXES, shellOf } from '../../layers/core/shared/navigation.ts'

export function walk(dir: string, extensions = ['.ts', '.vue']): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name.startsWith('.')) return []
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full, extensions) : extensions.some(e => name.endsWith(e)) && !name.endsWith('.d.ts') ? [full] : []
  })
}

const lines = (file: string) => readFileSync(file, 'utf8').split('\n')

/** Source files of a module, without its tests. */
function moduleFiles(m: Loaded): string[] {
  return walk(join(ROOT, m.found.root)).filter(f => !f.includes('/tests/'))
}

export function checkImports(modules: Loaded[]): string[] {
  const problems: string[] = []
  for (const m of modules) {
    // Core is always on, so any module may use its services without listing it.
    const allowed = new Set(['core', ...(m.manifest.requires ?? [])])
    const isCore = m.manifest.id === 'core'
    for (const file of moduleFiles(m)) {
      lines(file).forEach((line, i) => {
        const at = `${rel(file)}:${i + 1}`
        const imported = /from\s+['"]#modules\/([a-z0-9-]+)['"]/.exec(line)?.[1]
        if (imported && !allowed.has(imported)) problems.push(`${at}: imports #modules/${imported}, which is not in requires (a soft dependency talks through points, events and facts only)`)
        const relative = /from\s+['"]((\.\.\/)+)([^'"]*)['"]/.exec(line)
        if (relative) {
          const depth = relative[1]!.length / 3
          const fileDepth = rel(file).split('/').length - m.found.root.split('/').length - 1
          if (depth > fileDepth) problems.push(`${at}: reaches outside its module with a relative import; use #kit or #modules/<id>`)
        }
        if (!isCore && /from\s+['"]cloudflare:workers['"]|\benv\.(DB|FILES|CACHE|JOBS_PROMPT|JOBS_BULK)\b/.test(line)) problems.push(`${at}: uses a Cloudflare binding directly; go through the kit (useDb, files, cache, enqueue)`)
        if (!isCore && /\bfetch\(/.test(line) && !rel(file).includes('/server/calls/')) problems.push(`${at}: calls fetch outside server/calls; an outside call goes through externalCall`)
      })
    }
  }
  return problems
}

export function checkEventsAndJobs(modules: Loaded[], registry: any): string[] {
  const problems: string[] = []
  for (const m of modules) {
    for (const file of moduleFiles(m)) {
      lines(file).forEach((line, i) => {
        const at = `${rel(file)}:${i + 1}`
        for (const [, name] of line.matchAll(/\.announce\(\s*['"]([^'"]+)['"]/g)) {
          const declared = registry.events.get(name)
          if (!declared) problems.push(`${at}: announces "${name}", which no manifest declares`)
          else if (declared.module !== m.manifest.id) problems.push(`${at}: announces "${name}", which belongs to ${declared.module}; a module announces only its own events`)
        }
        for (const [, name] of line.matchAll(/enqueue\(\s*['"]([^'"]+)['"]/g)) {
          if (!registry.jobs.has(name)) problems.push(`${at}: queues "${name}", which no manifest declares`)
        }
      })
    }
  }
  for (const [name, { module, decl }] of registry.events as Map<string, any>) {
    const record = name.split('.')[1]
    const owner = registry.records.get(`${module}.${record}`)
    const table = owner && registry.tables.get(owner.decl.table)
    if (table?.meta.subjects.length && decl.internal === undefined) problems.push(`${module}: events.announces.${name}: its record's table has a subject, so state internal: true or false on purpose`)
  }
  return problems
}

export function checkContentTokens(registry: any): string[] {
  const problems: string[] = []
  const dirs = [join(ROOT, 'site/content'), ...readdirSync(join(ROOT, 'layers')).map(l => join(ROOT, 'layers', l, 'content'))]
  for (const file of dirs.flatMap(d => walk(d, ['.md']))) {
    lines(file).forEach((line, i) => {
      for (const [, name] of line.matchAll(/:setting\{\s*name="([^"]+)"\s*\}/g)) {
        const found = registry.settings.get(name)
        if (!found) problems.push(`${rel(file)}:${i + 1}: quotes the setting "${name}", which does not exist`)
        else if (!found.entry.quotable) problems.push(`${rel(file)}:${i + 1}: quotes "${name}", which is not marked quotable`)
      }
    })
  }
  return problems
}

export function checkTranslations(modules: Loaded[], registry: any): string[] {
  const problems: string[] = []
  for (const m of modules) {
    const id = m.manifest.id
    const file = join(ROOT, m.found.root, 'i18n/en-GB.json')
    if (!existsSync(file)) {
      problems.push(`${m.found.root}: has no i18n/en-GB.json`)
      continue
    }
    // A module's catalogue is i18n/en-GB.json plus any parts in i18n/en-GB/, so areas of one module
    // (core's foundations, identity and domain) can keep their strings apart.
    const partsDir = join(ROOT, m.found.root, 'i18n/en-GB')
    const parts = existsSync(partsDir) ? readdirSync(partsDir).filter(f => f.endsWith('.json')).map(f => join(partsDir, f)) : []
    const all = new Set([file, ...parts].flatMap(f => Object.keys(JSON.parse(readFileSync(f, 'utf8')))))
    const keys = new Set(all)
    const need = (key: string, what: string) => {
      if (!all.has(key)) problems.push(`${rel(file)}: needs "${key}" (${what})`)
      keys.delete(key)
    }
    need(`${id}.module.name`, 'the module\'s name')
    need(`${id}.module.description`, 'what the module does')
    for (const [key, { module, entry }] of registry.settings as Map<string, any>) {
      if (module !== id) continue
      const rest = key.slice(id.length + 1)
      need(`${id}.settings.${rest}.label`, 'the setting\'s label')
      need(`${id}.settings.${rest}.help`, 'the setting\'s help text')
      if (entry.unit) need(entry.unit, 'the setting\'s unit')
      for (const option of entry.options ?? []) need(`${id}.settings.${rest}.options.${option}`, 'a choice\'s label')
    }
    for (const rule of registry.settingRules.get(id) ?? []) need(`${id}.settings.rules.${rule.id}`, 'what a setting rule says when it fails')
    for (const [key, { module }] of registry.abilities as Map<string, any>) if (module === id) need(`${id}.abilities.${key.slice(id.length + 1)}.label`, 'the ability\'s label')
    const contributed = (point: string) => ((m.manifest.contributes ?? {}) as Record<string, any[]>)[point] ?? []
    for (const entry of contributed('core.navigation')) if (!entry.label) need(entryLabelKey(entry.id), 'the navigation entry\'s label')
    for (const group of contributed('core.navigation-group')) need(groupLabelKey(id, group.id), 'the navigation group\'s label')
    // A module with settings and no group of its own gets one named for it, which needs a label.
    for (const action of contributed('core.quick-action')) {
      const name = String(action.id).slice(id.length + 1)
      need(`${id}.quick-actions.${name}.label`, 'the quick action\'s label')
      if (action.keywords) need(action.keywords, 'the quick action\'s search words')
    }
    for (const tab of contributed('core.record-tab')) need(`${id}.record-tabs.${String(tab.id).slice(id.length + 1)}.label`, 'the record tab\'s label')
    for (const source of contributed('core.search-source')) need(`${id}.records.${String(source.record).slice(id.length + 1)}`, 'the name of the kind of record the search finds')
    const hasSettings = [...(registry.settings as Map<string, any>).values()].some(s => s.module === id)
    if (hasSettings && id !== 'core' && !contributed('core.navigation-group').length && !contributed('core.navigation').some((e: any) => e.group)) need(groupLabelKey(id, id), 'the label of the console group its settings page sits in')
    const sections = new Set<string>()
    for (const [key, { module }] of registry.settings as Map<string, any>) if (module === id) sections.add(key.slice(id.length + 1).split('.')[0]!)
    for (const section of sections) need(`${id}.settings-sections.${section}`, 'the heading of a group of settings on the generated settings page')
    const derived = [`${id}.settings.`, `${id}.abilities.`, `${id}.module.`, `${id}.navigation.`, `${id}.settings-sections.`, `${id}.quick-actions.`, `${id}.records.`, `${id}.record-tabs.`]
    for (const key of keys) if (derived.some(p => key.startsWith(p))) problems.push(`${rel(file)}: "${key}" is not used by any declaration`)
  }
  return problems
}

export function checkAbilities(modules: Loaded[], registry: any): string[] {
  const problems: string[] = []
  const required = new Set<string>()
  for (const route of allRoutes(modules)) if (route.ability) required.add(route.ability)
  for (const { entry } of registry.settings.values()) if (entry.change) required.add(entry.change)
  for (const [key, { module, decl }] of registry.abilities as Map<string, any>) for (const short of decl.implies ?? []) if (required.has(key)) required.add(`${module}.${short}`)
  // A navigation entry shows only to people who hold its ability, so that is a requirement too.
  for (const m of modules) {
    for (const entry of ((m.manifest.contributes ?? {}) as Record<string, any[]>)['core.navigation'] ?? []) for (const name of abilityList(entry.ability)) required.add(name)
  }
  for (const m of modules) {
    for (const file of moduleFiles(m)) {
      for (const [, name] of readFileSync(file, 'utf8').matchAll(/(?:can|requireAbility)\([^,]+,\s*['"]([^'"]+)['"]/g)) required.add(name!)
    }
  }
  for (const [key] of registry.abilities as Map<string, any>) if (!required.has(key)) problems.push(`abilities.${key}: is declared but nothing requires it`)
  for (const route of allRoutes(modules)) {
    const decl = route.ability && registry.abilities.get(route.ability)?.decl
    if (decl?.risk === 'privileged' && decl.fresh === false && route.method !== 'get' && route.method !== 'head') problems.push(`${route.file}: requires ${route.ability}, which skips freshness because it only reads, but this route changes something`)
  }
  return problems
}

/** Numbers in module server code are policy unless the line says not-policy. */
export function checkPolicyNumbers(modules: Loaded[]): string[] {
  const problems: string[] = []
  for (const m of modules) {
    if (m.found.root.startsWith('tests/')) continue // test fixtures hold sample data, not policy
    for (const file of walk(join(ROOT, m.found.root, 'server'), ['.ts'])) {
      if (file.includes('/server/db/')) continue
      lines(file).forEach((line, i) => {
        if (line.includes('not-policy') || /^\s*(\/\/|\/?\*)/.test(line)) return
        // Strings and HTTP statuses are not policy.
        const stripped = line.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""').replace(/status(Code)?:\s*\d{3}/g, '')
        for (const [number] of stripped.matchAll(/(?<![\w.])\d[\d_]*(\.\d+)?(?![\w])/g)) {
          if (!['0', '1', '2'].includes(number)) problems.push(`${rel(file)}:${i + 1}: the number ${number} looks like policy; make it a setting, or mark the line // not-policy: why`)
        }
      })
    }
  }
  return problems
}

/** The route a page file answers, with dynamic parts kept as `[name]`. */
function pageRoute(pagesDir: string, file: string): string {
  const parts = file.slice(pagesDir.length).replace(/\.vue$/, '').split('/').filter(Boolean)
  if (parts.at(-1) === 'index') parts.pop()
  return `/${parts.join('/')}`
}

/**
 * Navigation coverage (UI-08): every page a module puts inside the account, members', console or
 * live shell is reachable from a navigation entry, so nothing is built that nobody can find. A page
 * under an entry's address (or its `match` prefix) is covered; a shell's home page is not an entry.
 * A module's settings page is generated, and the entry for it is too.
 */
export function checkNavigation(modules: Loaded[], registry: any): string[] {
  const problems: string[] = []
  const entries: { to: string, match?: string }[] = []
  for (const m of modules) {
    for (const entry of ((m.manifest.contributes ?? {}) as Record<string, any[]>)['core.navigation'] ?? []) entries.push(entry)
  }
  // A count named by an entry or a section is registered by some module's core.count contribution.
  const counts = new Set<string>()
  for (const m of modules) for (const c of ((m.manifest.contributes ?? {}) as Record<string, any[]>)['core.count'] ?? []) counts.add(c.id)
  for (const m of modules) {
    const contributes = (m.manifest.contributes ?? {}) as Record<string, any[]>
    for (const point of ['core.navigation', 'core.account-section']) {
      for (const e of contributes[point] ?? []) if (e.count && !counts.has(e.count)) problems.push(`${m.found.root}: ${point} ${e.id} names the count "${e.count}", which no module registers in core.count`)
    }
  }
  const withSettings = new Set<string>()
  let siteSettings = false
  for (const { module, entry } of registry.settings.values() as Iterable<{ module: string, entry: { scope?: string } }>) {
    if (entry.scope === 'site') siteSettings = true
    else withSettings.add(module)
  }
  for (const module of withSettings) entries.push({ to: module === 'core' ? '/console/system/settings' : `/console/${module}/settings` })
  if (siteSettings) entries.push({ to: '/admin/settings' })
  const homes = new Set(Object.values(SHELL_PREFIXES))
  for (const m of modules) {
    const pagesDir = join(ROOT, m.found.root, 'app/pages')
    for (const file of walk(pagesDir, ['.vue'])) {
      const route = pageRoute(pagesDir, file)
      const shell = shellOf(route)
      if (!shell || homes.has(route)) continue
      const fixed = route.split('/').filter(Boolean)
      const dynamic = fixed.findIndex(part => part.startsWith('['))
      const prefix = `/${(dynamic === -1 ? fixed : fixed.slice(0, dynamic)).join('/')}`
      // The core settings page answers /console/<module>/settings for every module with settings.
      if (route === '/console/[module]/settings') continue
      if (!resolveEntry(entries, prefix)) problems.push(`${rel(file)}: the page ${route} has no navigation entry; contribute one to core.navigation whose \`to\` or \`match\` covers it`)
    }
  }
  return problems
}

/** Identity's own code may compare an account column to an id: its tables are keyed by the account itself. */
const EXACT_ACCOUNT_HOME = 'layers/core/server/identity/'

/**
 * A read by account goes through the account scope (Foundations, Data-class registry, "The account
 * scope"): a merge leaves most account columns holding the id they were written with, so comparing
 * one to an id misses the person's other rows. Refuses eq, ne, inArray and raw SQL that compare a
 * col.account column to a value, and exactAccount without a reason, outside identity's own code.
 */
export function checkAccountComparisons(modules: Loaded[], registry: any): string[] {
  // Which tables hold each column name as an account column, and which hold it as something else
  // (finance_entries.account_id is a ledger account), so a name is judged by the tables on its line.
  const accountIn = new Map<string, Set<string>>()
  const otherIn = new Map<string, Set<string>>()
  const keyIs = new Map<string, { account: boolean, other: boolean }>()
  const add = (map: Map<string, Set<string>>, name: string, table: string) => map.set(name, (map.get(name) ?? new Set()).add(table))
  for (const [table, { meta }] of registry.tables as Map<string, any>) {
    for (const [key, c] of Object.entries(meta.columns as Record<string, any>)) {
      add(c.meta.account ? accountIn : otherIn, c.sql, table)
      const k = keyIs.get(key) ?? { account: false, other: false }
      k[c.meta.account ? 'account' : 'other'] = true
      keyIs.set(key, k)
    }
  }
  if (!accountIn.size) return []
  const alt = (names: Iterable<string>) => [...names].sort((a, b) => b.length - a.length).join('|')
  const column = `(?<![\\w])(?:\\w+\\.)?"?(${alt(accountIn.keys())})"?`
  const value = '(?:\\?\\d*|\\$\\{(?!\\s*(?:accountScope(?:Sql)?|inAccountScope)\\())'
  const raw = [
    new RegExp(`${column}\\s*(?:==?|!=|<>)\\s*${value}`, 'gi'),
    new RegExp(`${column}\\s+IS\\s+(?:NOT\\s+)?${value}`, 'gi'),
    new RegExp(`${column}\\s+(?:NOT\\s+)?IN\\s*(?:\\(\\s*)?(?:${value}|SELECT\\s+value\\s+FROM\\s+json_each)`, 'gi'),
  ]
  const accountKeys = [...keyIs].filter(([, k]) => k.account && !k.other).map(([key]) => key)
  const drizzle = accountKeys.length ? new RegExp(`\\b(?:eq|ne|inArray|notInArray)\\(\\s*[\\w.]+\\.(?:${alt(accountKeys)})\\b`) : undefined
  const tableNames = new RegExp(`\\b(${alt((registry.tables as Map<string, any>).keys())})\\b`, 'g')
  // A name compared on a line is an account column if a table named near it (the statement's
  // lines) holds it as one, or, with no table in sight, if no table holds that name as anything else.
  const isAccount = (name: string, near: string) => {
    const named = [...near.matchAll(tableNames)].map(m => m[1]!)
    if (named.length) return named.some(t => accountIn.get(name)?.has(t))
    return !otherIn.has(name)
  }
  const problems: string[] = []
  for (const m of modules) {
    if (m.found.root.startsWith('tests/')) continue // fixtures show the kit, not a module's reads
    for (const file of walk(join(ROOT, m.found.root, 'server'), ['.ts'])) {
      const at = rel(file)
      if (at.includes('/server/db/') || at.startsWith(EXACT_ACCOUNT_HOME)) continue
      const all = lines(file)
      all.forEach((line, i) => {
        if (/^\s*(\/\/|\/?\*)/.test(line)) return
        if (line.includes('exact-account:')) return
        const near = all.slice(Math.max(0, i - 6), i + 3).join('\n') // not-policy: the lines a statement usually spans
        if (/(?<!function\s+)\bexactAccount\(/.test(line)) {
          problems.push(`${at}:${i + 1}: exactAccount outside identity needs a reason; end the line with // exact-account: why`)
          return
        }
        // A name after SET and before WHERE is being assigned, not compared.
        const assigned = (index: number) => {
          const before = line.slice(0, index).toUpperCase()
          return before.search(/\bSET\b(?![\s\S]*\bSET\b)/) > before.search(/\bWHERE\b(?![\s\S]*\bWHERE\b)/)
        }
        const compared = raw.flatMap(r => [...line.matchAll(r)].filter(match => !assigned(match.index!)).map(match => match[1]!.toLowerCase()))
        if (drizzle?.test(line) || compared.some(name => isAccount(name, near)))
          problems.push(`${at}:${i + 1}: compares an account column to an id; use inAccountScope(column, account) so rows of merged accounts are found, or exactAccount with // exact-account: why`)
      })
    }
  }
  return problems
}

/**
 * sealSpecial writes a special or encrypted column and nothing else (Foundations part 4, T5): a
 * link token is never sealed, it is hashed with linkTokens. Refuses sealSpecial in a module that has
 * no such column, and a call whose argument names a token or a link.
 */
export function checkSealSpecial(modules: Loaded[], registry: any): string[] {
  const problems: string[] = []
  for (const m of modules) {
    const sealsColumns = [...(registry.tables as Map<string, any>).values()].some(t => t.module === m.manifest.id && Object.values(t.meta.columns as Record<string, any>).some(c => c.meta.encrypted))
    for (const file of moduleFiles(m).filter(f => f.endsWith('.ts') && !rel(f).startsWith('layers/core/kit/'))) {
      lines(file).forEach((line, i) => {
        if (!/\b(sealSpecial|sealColumn)\(/.test(line)) return
        const at = `${rel(file)}:${i + 1}`
        if (!sealsColumns) problems.push(`${at}: sealSpecial and sealColumn write a special or encrypted column, and this module has none`)
        for (const [, , argument] of line.matchAll(/\b(sealSpecial|sealColumn)\(([^)]*)\)/g)) {
          if (/token|link/i.test(argument!)) problems.push(`${at}: seals a link token; a token is never sealed or stored, keep linkTokens.hash(token) instead`)
        }
      })
    }
  }
  return problems
}

// A statement's count of changed rows includes rows its triggers and a search index wrote, so an
// INSERT into a searched table can count 3 (Foundations part 3, "Counting changed rows"). A count
// may be tested against nought; a unit that needs an exact count uses the kit's guard.
const COMPARE = '(===|!==|==|!=|<=|>=|<|>)'
const CHANGES_AFTER = new RegExp(`\\bchanges\\b(?!\\s*\\()[\\s)?]*(?:\\?\\?\\s*\\d+[\\s)]*)?${COMPARE}\\s*(-?\\d+(?:\\.\\d+)?)`, 'g')
const CHANGES_BEFORE = new RegExp(`(-?\\d+(?:\\.\\d+)?)\\s*${COMPARE}\\s*\\(?\\s*[\\w.?[\\]]*\\.changes\\b(?!\\s*\\()`, 'g')

/** Lines (1-based) that compare a statement's changed-row count with a number other than nought. */
export function exactChangeCounts(source: string): number[] {
  const found: number[] = []
  source.split('\n').forEach((line, i) => {
    const numbers = [...line.matchAll(CHANGES_AFTER)].map(m => m[2]!).concat([...line.matchAll(CHANGES_BEFORE)].map(m => m[1]!))
    if (numbers.some(n => Number(n) !== 0)) found.push(i + 1)
  })
  return found
}

/** Lines (1-based) whose SQL reads SQLite's changes(). */
export function changesInSql(source: string): number[] {
  return source.split('\n').flatMap((line, i) => /\bchanges\s*\(\s*\)/.test(line) && !/^\s*(\/\/|\*)/.test(line) ? [i + 1] : [])
}

export function checkChangeCounts(modules: Loaded[]): string[] {
  const problems: string[] = []
  for (const m of modules) {
    for (const file of moduleFiles(m).filter(f => f.endsWith('.ts'))) {
      const source = readFileSync(file, 'utf8')
      for (const line of exactChangeCounts(source)) problems.push(`${rel(file)}:${line}: compares a count of changed rows with a number other than 0; triggers and search indexes add to the count, so test it against 0 or use the unit of work's guard`)
      // A search index flushes what it holds when the next write opens, so changes() read by a later
      // statement can be stale (Foundations part 3, "the claim stamp"). Only the kit's guard reads it.
      if (rel(file).startsWith('layers/core/kit/')) continue
      for (const line of changesInSql(source)) problems.push(`${rel(file)}:${line}: reads changes() in SQL, which a search index can leave stale; stamp the row in the conditional write and read the stamp back`)
    }
  }
  return problems
}
