// Checks that read the source: imports, bindings, outside calls, announced events and queued jobs,
// content tokens, translations, abilities nobody requires, and numbers that should be settings.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, rel } from '../lib/paths.ts'
import type { Loaded } from '../lib/load.ts'
import { allRoutes } from './routes.ts'

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
    const derived = [`${id}.settings.`, `${id}.abilities.`, `${id}.module.`]
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
  for (const m of modules) {
    for (const file of moduleFiles(m)) {
      for (const [, name] of readFileSync(file, 'utf8').matchAll(/(?:can|requireAbility)\([^,]+,\s*['"]([^'"]+)['"]/g)) required.add(name!)
    }
  }
  for (const [key] of registry.abilities as Map<string, any>) if (!required.has(key)) problems.push(`abilities.${key}: is declared but nothing requires it`)
  return problems
}

/** Numbers in module server code are policy unless the line says not-policy. */
export function checkPolicyNumbers(modules: Loaded[]): string[] {
  const problems: string[] = []
  for (const m of modules) {
    for (const file of walk(join(ROOT, m.found.root, 'server'), ['.ts'])) {
      if (file.includes('/server/db/')) continue
      lines(file).forEach((line, i) => {
        if (line.includes('not-policy') || /^\s*(\/\/|\*)/.test(line)) return
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
