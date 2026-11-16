// The fork's own site (C-40): the public menu comes from site/content/navigation.yml, and every
// link in it that stays on the site must reach a page. A Markdown page may use only the components
// some module offers through core.public-component, so a typo fails the check, not the visitor.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ROOT } from '../lib/paths.ts'

export interface NavigationLink { label: string, to: string }
export interface Navigation { header?: NavigationLink[], footer?: NavigationLink[] }

function walk(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full, ext) : name.endsWith(ext) ? [full] : []
  })
}

/** The address Nuxt Content gives each page under site/content/pages: index.md is its folder. */
export function pagePaths(pagesDir: string): Set<string> {
  const out = new Set<string>()
  for (const file of walk(pagesDir, '.md')) {
    const path = `/${relative(pagesDir, file).replace(/\\/g, '/').replace(/\.md$/, '').replace(/(^|\/)index$/, '').replace(/(^|\/)\d+\./g, '$1')}`
    out.add(path === '/' ? '/' : path.replace(/\/$/, ''))
  }
  return out
}

/** Problems with the navigation file: its shape, and links to pages that do not exist. */
export function navigationProblems(navigation: unknown, pages: Set<string>, file = 'site/content/navigation.yml'): string[] {
  const problems: string[] = []
  if (!navigation || typeof navigation !== 'object') return [`${file}: should hold header: and footer: lists of { label, to }`]
  for (const [section, links] of Object.entries(navigation as Record<string, unknown>)) {
    if (section !== 'header' && section !== 'footer') {
      problems.push(`${file}: "${section}" is not a menu; the menus are header and footer`)
      continue
    }
    if (links === null || links === undefined) continue
    if (!Array.isArray(links)) {
      problems.push(`${file}: ${section} is a list of { label, to }`)
      continue
    }
    links.forEach((link: any, i) => {
      const at = `${file}: ${section}[${i}]`
      if (!link || typeof link.label !== 'string' || !link.label.trim()) problems.push(`${at}: needs a label`)
      if (!link || typeof link.to !== 'string') return problems.push(`${at}: needs to:, a page such as /about or an https address`)
      const to = link.to as string
      if (/^https:\/\//.test(to) || /^mailto:/.test(to)) return
      if (!to.startsWith('/')) return problems.push(`${at}: "${to}" is neither a page on this site (/about) nor an https address`)
      const path = to.split(/[?#]/)[0]!.replace(/\/$/, '') || '/'
      if (!pages.has(path)) problems.push(`${at}: links to ${path}, which is not a page. Add site/content/pages${path === '/' ? '/index' : path}.md or change the link`)
    })
  }
  return problems
}

// ::name, :name{...} or :name[...] at the start of a line or after a space.
const COMPONENT = /(?:^|\s):{1,}([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?=[{[\s]|$)/g

/** Components a Markdown page uses that no module offers. */
export function componentProblems(files: { file: string, source: string }[], offered: Set<string>): string[] {
  const problems: string[] = []
  for (const { file, source } of files) {
    let fenced = false
    source.split('\n').forEach((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
      if (fenced) return
      const text = line.replace(/`[^`]*`/g, '')
      for (const [, name] of text.matchAll(COMPONENT)) {
        if (!offered.has(name!)) problems.push(`${file}:${i + 1}: uses the component "${name}", which no module offers. Offered: ${[...offered].sort().join(', ') || 'none'}`)
      }
    })
  }
  return problems
}

/** Standard HTML elements with one-word names: an alias may not shadow one (a hyphenated name never does). */
const HTML_ELEMENTS = new Set(('a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option output p param picture pre progress q rp rt ruby s samp script search section select slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr svg math').split(' '))

export interface PublicComponent { module: string, id: string, component?: string, alias?: string }

/** Every core.public-component entry, with the module that offers it. */
export function publicComponents(registry: any): PublicComponent[] {
  const out: PublicComponent[] = []
  for (const entry of registry.modules.values()) {
    for (const c of entry.manifest.contributes?.['core.public-component'] ?? []) out.push({ module: entry.manifest.id, id: c.id, component: c.component, alias: c.alias })
  }
  return out
}

const pascal = (kebab: string) => kebab.split('-').map(p => p[0]!.toUpperCase() + p.slice(1)).join('')

/** An alias is unique across modules and never an HTML element; a component starts with its module's id. */
export function publicComponentProblems(components: PublicComponent[]): string[] {
  const problems: string[] = []
  const seen = new Map<string, string>()
  for (const c of components) {
    const at = `${c.module}: contributes.core.public-component.${c.id}`
    const name = c.alias ?? c.id
    if (HTML_ELEMENTS.has(name)) problems.push(`${at}: the alias "${name}" would shadow the HTML element <${name}>`)
    const other = seen.get(name)
    if (other) problems.push(`${at}: the alias "${name}" is already ${other}'s; aliases are unique across modules`)
    else seen.set(name, c.module)
    if (c.component && !c.component.startsWith(pascal(c.module))) problems.push(`${at}: the component "${c.component}" must start with its module's name, ${pascal(c.module)}`)
  }
  return problems
}

/** The whole check, as `bun run check:conformance` runs it. */
export function checkSite(registry: any, parseYaml: (source: string) => unknown): string[] {
  const components = publicComponents(registry)
  const offered = new Set(components.map(c => c.alias ?? c.id))
  const content = join(ROOT, 'site/content')
  const pages = pagePaths(join(content, 'pages'))
  const problems: string[] = []
  const navFile = join(content, 'navigation.yml')
  if (existsSync(navFile)) {
    let parsed: unknown
    try { parsed = parseYaml(readFileSync(navFile, 'utf8')) }
    catch (error) { return [`site/content/navigation.yml: is not valid YAML: ${(error as Error).message}`] }
    problems.push(...navigationProblems(parsed, pages))
  }
  const files = walk(content, '.md').map(file => ({ file: relative(ROOT, file), source: readFileSync(file, 'utf8') }))
  problems.push(...publicComponentProblems(components))
  problems.push(...componentProblems(files, offered))
  return problems
}
