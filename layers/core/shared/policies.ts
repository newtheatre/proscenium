// Policies (privacy notice, terms, house rules): each is a list of Markdown sections that modules
// contribute from content/policies/<policy>/, with the theatre's own under site/content/policies/.
// This file is the pure part, shared by the build's checks, the server and the page: reading a
// section's front matter, deciding which sections a policy shows, deciding whether a condition
// holds, and writing a section out as plain Markdown with every value filled in. The same decisions
// are used wherever a policy is shown or recorded, so the page and its record cannot disagree.

/** One test: a setting's value, whether a setting is set at all, whether a module is on, or a fact. */
export interface PolicyCondition {
  setting?: string
  fact?: string
  /** Holds while the named setting has any value. */
  has?: string
  /** Holds while the named module is switched on. */
  module?: string
  is?: string
  not?: string
  /** Holds while the setting or fact is a number greater than this. */
  above?: string
}

export interface PolicyValue { value: unknown, text?: string }

/** A table a policy shows that the system builds from what modules declare. */
export interface PolicyTable { headers: string[], rows: string[][] }

/** Everything a condition or a token may read. All of it is already public. */
export interface PolicyContext {
  settings: Record<string, PolicyValue>
  facts: Record<string, PolicyValue>
  tables: Record<string, PolicyTable>
  /** Module ids that are switched on. */
  modules: string[]
  /** The theatre's country, lower case: which pack of law-specific sections applies. */
  country: string
}

export interface PolicySection {
  policy: string
  /** The file's name without `.md`: unique within a policy across every module. */
  id: string
  /** The module whose folder holds the file, or `site` for site/content/policies. */
  module: string
  owner: 'upstream' | 'site'
  /** The file, from the repository's root. */
  file: string
  title: string
  order: number
  /** The date the wording last changed in a way a reader would care about (YYYY-MM-DD). */
  revised?: string
  when: PolicyCondition[]
  /** `any`, or the country whose law the section states. */
  law: string
  /** A theatre's file standing in for an upstream section: drop the section altogether. */
  hidden?: boolean
  reason?: string
  /** A theatre's replacement: the hash of the upstream section it was written against. */
  basedOn?: string
  /** Upstream cannot write this honestly for a theatre: it is left out until the theatre writes its own. */
  mustWrite?: boolean
  /** One plain line on what changed, when readers should be told. */
  material?: string
  body: string
  /** A short hash of the title and body, for telling whether upstream moved on. */
  hash: string
}

const FRONT_MATTER_KEYS = ['title', 'order', 'revised', 'when', 'law', 'hidden', 'reason', 'based-on', 'must-write', 'material'] as const
const CONDITION_KEYS = ['setting', 'fact', 'has', 'module', 'is', 'not', 'above']
const DATE = /^\d{4}-\d{2}-\d{2}$/ // not-policy: the shape of a date
const LAW = /^[a-z]{2}$/ // not-policy: a two-letter country code

/** The attributes of a token or a condition: name="value" pairs. */
export function readAttributes(source: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [, key, value] of source.matchAll(/([a-z][a-z-]*)="([^"]*)"/g)) out[key!] = value!
  return out
}

/** Conditions as front matter writes them: one or more sets of attributes, split by semicolons. */
export function readConditions(source: string, problems: string[] = []): PolicyCondition[] {
  const out: PolicyCondition[] = []
  for (const part of source.split(';').map(p => p.trim()).filter(Boolean)) {
    const attrs = readAttributes(part)
    const unknown = Object.keys(attrs).filter(k => !CONDITION_KEYS.includes(k))
    if (unknown.length) problems.push(`a condition cannot test "${unknown[0]}"; it tests ${CONDITION_KEYS.join(', ')}`)
    const subjects = ['setting', 'fact', 'has', 'module'].filter(k => attrs[k] !== undefined)
    if (subjects.length !== 1) problems.push(`a condition names exactly one of setting, fact, has or module: "${part}"`)
    else if ((subjects[0] === 'setting' || subjects[0] === 'fact') && attrs.is === undefined && attrs.not === undefined && attrs.above === undefined) problems.push(`a condition on a ${subjects[0]} needs is, not or above: "${part}"`)
    out.push(attrs)
  }
  return out
}

function unquote(value: string): string {
  const v = value.trim()
  return (v.startsWith('\'') && v.endsWith('\'')) || (v.startsWith('"') && v.endsWith('"')) ? v.slice(1, -1) : v
}

export interface ParsedSection { fields: Partial<Pick<PolicySection, 'title' | 'order' | 'revised' | 'law' | 'hidden' | 'reason' | 'basedOn' | 'mustWrite' | 'material'>> & { when?: PolicyCondition[] }, body: string, problems: string[] }

/**
 * Reads a section file. Its front matter is deliberately small: one `key: value` a line, no nesting,
 * so the build can read it without a YAML parser and a mistake is named rather than guessed at.
 */
export function parseSection(source: string): ParsedSection {
  const problems: string[] = []
  const text = source.replace(/\r\n?/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  if (!match) return { fields: {}, body: text.trim(), problems: ['has no front matter; it starts with --- and at least a title'] }
  const fields: ParsedSection['fields'] = {}
  for (const line of match[1]!.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const at = line.indexOf(':')
    const key = at === -1 ? line.trim() : line.slice(0, at).trim()
    if (at === -1 || !(FRONT_MATTER_KEYS as readonly string[]).includes(key)) {
      problems.push(`front matter has "${key}", which a policy section does not take; it takes ${FRONT_MATTER_KEYS.join(', ')}`)
      continue
    }
    const value = line.slice(at + 1).trim()
    const flag = () => {
      if (value !== 'true' && value !== 'false') problems.push(`${key} is true or false`)
      return value === 'true'
    }
    if (key === 'title') fields.title = unquote(value)
    else if (key === 'order') {
      fields.order = Number(value)
      if (!Number.isInteger(fields.order)) problems.push('order is a whole number')
    }
    else if (key === 'revised') {
      fields.revised = unquote(value)
      if (!DATE.test(fields.revised)) problems.push('revised is a date written YYYY-MM-DD')
    }
    else if (key === 'when') fields.when = readConditions(unquote(value), problems)
    else if (key === 'law') {
      fields.law = unquote(value).toLowerCase()
      if (fields.law !== 'any' && !LAW.test(fields.law)) problems.push('law is any, or a two-letter country code such as gb')
    }
    else if (key === 'hidden') fields.hidden = flag()
    else if (key === 'reason') fields.reason = unquote(value)
    else if (key === 'based-on') fields.basedOn = unquote(value)
    else if (key === 'must-write') fields.mustWrite = flag()
    else if (key === 'material') fields.material = unquote(value)
  }
  return { fields, body: text.slice(match[0].length).trim(), problems }
}

/** A short, stable hash of a string (FNV-1a over its UTF-16 units, twice seeded), as 16 hex digits. */
export function shortHash(text: string): string {
  const run = (seed: number) => {
    let h = seed
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 16777619) // not-policy: the FNV prime
    }
    return (h >>> 0).toString(16).padStart(8, '0') // not-policy: hex digits of 32 bits
  }
  return run(2166136261) + run(3339675911) // not-policy: FNV offset bases
}

const isSet = (value: unknown) => value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)

export function holds(condition: PolicyCondition, context: PolicyContext): boolean {
  if (condition.module !== undefined) return context.modules.includes(condition.module)
  if (condition.has !== undefined) return isSet(context.settings[condition.has]?.value)
  const subject = condition.setting !== undefined ? context.settings[condition.setting] : context.facts[condition.fact ?? '']
  const value = subject?.value
  if (condition.is !== undefined && String(value ?? '') !== condition.is) return false
  if (condition.not !== undefined && String(value ?? '') === condition.not) return false
  if (condition.above !== undefined && !(typeof value === 'number' && value > Number(condition.above))) return false
  return true
}

export const allHold = (conditions: PolicyCondition[], context: PolicyContext) => conditions.every(c => holds(c, context))

export interface SelectedSections {
  sections: PolicySection[]
  /** Upstream sections the theatre must write and has not: left off the page, listed for staff. */
  unwritten: PolicySection[]
  /** The theatre's replacements whose upstream section has changed since they were written. */
  stale: { section: PolicySection, upstream: PolicySection }[]
}

/**
 * The sections a policy shows, in order: every switched-on module's, with the theatre's replacements
 * swapped in, its extras added and its hidden ones dropped; then only those whose conditions hold
 * and whose law is the theatre's.
 */
export function selectSections(all: PolicySection[], policy: string, context: PolicyContext): SelectedSections {
  const mine = all.filter(s => s.policy === policy)
  const theatre = new Map(mine.filter(s => s.module === 'site').map(s => [s.id, s]))
  const out: PolicySection[] = []
  const unwritten: PolicySection[] = []
  const stale: SelectedSections['stale'] = []
  const replaced = new Set<string>()
  for (const base of mine.filter(s => s.module !== 'site')) {
    const own = theatre.get(base.id)
    if (own) replaced.add(base.id)
    if (!context.modules.includes(base.module)) continue
    if (!own) {
      if (base.mustWrite) unwritten.push(base)
      else out.push(base)
      continue
    }
    if (own.basedOn && own.basedOn !== base.hash) stale.push({ section: own, upstream: base })
    if (own.hidden) continue
    // A replacement keeps the place, conditions and law of what it replaces unless it states its own.
    out.push({ ...own, order: Number.isNaN(own.order) ? base.order : own.order, when: own.when.length ? own.when : base.when, law: own.law === 'inherit' ? base.law : own.law })
  }
  for (const own of theatre.values()) {
    if (!replaced.has(own.id) && !own.hidden) out.push({ ...own, order: Number.isNaN(own.order) ? 0 : own.order, law: own.law === 'inherit' ? 'any' : own.law })
  }
  const sections = out
    .filter(s => (s.law === 'any' || s.law === context.country) && allHold(s.when, context))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  return { sections, unwritten, stale }
}

const FENCE = /^\s*(```|~~~)/
const OPEN = /^\s*(:{2,})([a-z][a-z0-9-]*)(?:\{(.*)\})?\s*$/
const CLOSE = /^\s*(:{2,})\s*$/
const SLOT = /^\s*#([a-z][a-z0-9-]*)\s*$/
const INLINE = /:(setting|fact)\{([^}]*)\}/g

export interface SectionTokens {
  /** Each :setting token: its setting, whether it gives a fallback, and whether a `has` on it guards it. */
  settings: { name: string, line: number, fallback: boolean, guarded: boolean }[]
  facts: { name: string, line: number }[]
  /** Each condition a ::when writes, with its line. */
  conditions: { condition: PolicyCondition, line: number }[]
  tables: { kind: string, line: number }[]
  problems: { line: number, message: string }[]
}

interface Frame { depth: number, name: string, condition?: PolicyCondition, otherwise: boolean }

/** Walks a section's body the way renderBody does, calling back for each line and its open blocks. */
function walk(body: string, visit: (line: string, index: number, frames: Frame[], kind: 'text' | 'open' | 'close' | 'slot' | 'fenced') => void): Frame[] {
  const frames: Frame[] = []
  let fenced = false
  body.split('\n').forEach((line, index) => {
    if (FENCE.test(line)) {
      fenced = !fenced
      return visit(line, index, frames, 'fenced')
    }
    if (fenced) return visit(line, index, frames, 'fenced')
    const open = OPEN.exec(line)
    if (open) {
      const attrs = readAttributes(open[3] ?? '')
      frames.push({ depth: open[1]!.length, name: open[2]!, condition: open[2] === 'when' ? attrs : undefined, otherwise: false })
      return visit(line, index, frames, 'open')
    }
    const close = CLOSE.exec(line)
    if (close && frames.length && frames[frames.length - 1]!.depth === close[1]!.length) {
      visit(line, index, frames, 'close')
      frames.pop()
      return
    }
    const slot = SLOT.exec(line)
    if (slot && frames.length && frames[frames.length - 1]!.name === 'when' && slot[1] === 'otherwise') {
      frames[frames.length - 1]!.otherwise = true
      return visit(line, index, frames, 'slot')
    }
    visit(line, index, frames, 'text')
  })
  return frames
}

/** What a section's body quotes and tests, for the build's checks. */
export function sectionTokens(body: string): SectionTokens {
  const out: SectionTokens = { settings: [], facts: [], conditions: [], tables: [], problems: [] }
  const left = walk(body, (line, index, frames, kind) => {
    const at = index + 1
    if (kind === 'open') {
      const frame = frames[frames.length - 1]!
      if (frame.name === 'when') {
        const problems: string[] = []
        const attrs = OPEN.exec(line)?.[3] ?? ''
        readConditions(attrs, problems)
        for (const message of problems) out.problems.push({ line: at, message })
        out.conditions.push({ condition: frame.condition!, line: at })
      }
      else if (frame.name === 'policy-table') {
        const table = readAttributes(OPEN.exec(line)?.[3] ?? '').kind
        if (!table) out.problems.push({ line: at, message: '::policy-table names its table: ::policy-table{kind="cookies"}' })
        else out.tables.push({ kind: table, line: at })
      }
      return
    }
    if (kind !== 'text') return
    for (const [, token, source] of line.replace(/`[^`]*`/g, '').matchAll(INLINE)) {
      const attrs = readAttributes(source!)
      if (!attrs.name) {
        out.problems.push({ line: at, message: `:${token} names what it quotes: :${token}{name="..."}` })
        continue
      }
      if (token === 'fact') out.facts.push({ name: attrs.name, line: at })
      else out.settings.push({ name: attrs.name, line: at, fallback: attrs.fallback !== undefined, guarded: frames.some(f => !f.otherwise && f.condition?.has === attrs.name) })
    }
  })
  for (const frame of left) out.problems.push({ line: body.split('\n').length, message: `::${frame.name} is never closed; end it with ${':'.repeat(frame.depth)} on a line of its own` })
  return out
}

function table(found: PolicyTable | undefined): string[] {
  if (!found || !found.rows.length) return []
  const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  return [
    `| ${found.headers.map(cell).join(' | ')} |`,
    `| ${found.headers.map(() => '---').join(' | ')} |`,
    ...found.rows.map(row => `| ${row.map(cell).join(' | ')} |`),
  ]
}

/** What a token shows: a setting's or fact's text, or the token's fallback while there is none. */
export function tokenText(kind: 'setting' | 'fact', attrs: Record<string, string>, context: PolicyContext): string {
  const found = (kind === 'setting' ? context.settings : context.facts)[attrs.name ?? '']
  const text = found?.text ?? (isSet(found?.value) ? String(found!.value) : '')
  return text || attrs.fallback || ''
}

/**
 * A section's body as plain Markdown: each ::when keeps the side that holds, each token becomes its
 * value and each ::policy-table its rows. This is the text a policy's version records.
 */
export function renderBody(body: string, context: PolicyContext): string {
  const out: string[] = []
  const shown = (frames: Frame[]) => frames.every(f => f.name !== 'when' || holds(f.condition!, context) !== f.otherwise)
  walk(body, (line, _index, frames, kind) => {
    if (kind === 'fenced') {
      if (shown(frames)) out.push(line)
      return
    }
    if (kind === 'open') {
      const frame = frames[frames.length - 1]!
      if (frame.name === 'policy-table' && shown(frames.slice(0, -1))) out.push(...table(context.tables[readAttributes(OPEN.exec(line)?.[3] ?? '').kind ?? '']))
      return
    }
    if (kind !== 'text' || !shown(frames)) return
    // Text inside a block that is not a ::when (a table's own slot, say) is that component's to draw.
    if (frames.some(f => f.name !== 'when')) return
    out.push(line.replace(INLINE, (_all, token: 'setting' | 'fact', source: string) => tokenText(token, readAttributes(source), context)))
  })
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** A whole policy as plain Markdown: its title, then each section under its heading. */
export function renderPolicy(title: string, sections: PolicySection[], context: PolicyContext): string {
  return [`# ${title}`, ...sections.map(s => `## ${s.title}\n\n${renderBody(s.body, context)}`)].join('\n\n')
}
