// Settings: every operational number, deadline and toggle, declared once with a kind, a default,
// limits and the ability needed to change it (Settings registry tab).
import type { z } from 'zod'
import { DeclarationError } from './refusal'
import { DURATION_UNITS, formatDuration, isDuration, parseDuration, type DurationUnit } from './duration'
import { catalogueValues, isCatalogue, type Catalogue } from './catalogues'

export type Audience = 'public' | 'signed-in' | 'staff'

interface Common {
  /** The ability needed to change it. */
  change: string
  audience?: Audience
  quotable?: boolean
  sensitive?: boolean
  managed?: boolean
  replaces?: string
  since?: string
  /** What the screen asks before saving: a written reason, or a second confirmation. */
  onChange?: 'reason' | 'confirm'
  /** Another module this setting only applies while it is on, such as 'membership-fees'; the settings screens leave it out while that module is off. */
  whenModule?: string
  /**
   * The address of a bespoke screen that manages this one setting, where only part of its group is
   * bespoke. Where it is shown is otherwise declared per group, in the manifest's settingGroups.
   */
  screen?: string
}

type WithDefault<V> = { default: V, unset?: false } | { default?: undefined, unset: true }

export interface SettingEntry<V = unknown, K extends string = string> extends Common {
  kind: K
  default?: unknown
  unset?: boolean
  min?: unknown
  max?: unknown
  maxLength?: number
  minLength?: number
  /** text only: several lines, such as an address, drawn as a text area. */
  multiline?: boolean
  options?: readonly string[]
  /** A choice from one of the kit's fixed lists instead of options of its own (catalogues.ts). */
  catalogue?: Catalogue
  unit?: string
  /** duration only: the units its control offers, such as days and weeks for a review period. */
  units?: readonly DurationUnit[]
  record?: string
  schema?: z.ZodType
  of?: 'text' | 'choice'
  /** list of text only: a GET route answering `{ items: { value, label }[] }`, the values to pick from. */
  choices?: string
  /** What a colour sits on, for the contrast check: another colour setting's key. */
  on?: string
  /** Phantom: the type a read returns. */
  readonly __value?: V
}

const KINDS = ['boolean', 'integer', 'money', 'duration', 'time', 'text', 'choice', 'list', 'reference', 'custom', 'colour', 'rate'] as const

/** A rate as written: a count in a period, `{ count: 10, per: '10m' }`. Read with `per` in seconds. */
export interface RateInput { count: number, per: string }
export interface Rate { count: number, per: number }
export const RATE_COUNT = { min: 1, max: 10_000 }
export const RATE_PERIOD = { min: '1m', max: '1d' }
export type SettingKind = typeof KINDS[number]

type Value<V, U> = U extends { unset: true } ? V | null : V

/**
 * One of a fixed set. Either the setting lists its own options (kebab-case or numbers, labelled from
 * `<module>.settings.<group>.<name>.options.<option>`), or it names one of the kit's catalogues of
 * standard codes (time zones, currencies, countries, languages), labelled by the browser. Either way
 * the screen draws a dropdown, searchable once the list is long (shared/choices.ts).
 */
function choice<const Opt extends readonly string[], const O extends Common & WithDefault<Opt[number]> & { options: Opt }>(o: O & { options: Opt }): SettingEntry<Value<Opt[number], O>, 'choice'> & O
function choice<const O extends Common & WithDefault<string> & { catalogue: Catalogue }>(o: O): SettingEntry<Value<string, O>, 'choice'> & O
function choice(o: Common & { options?: readonly string[], catalogue?: Catalogue }) {
  return { kind: 'choice', ...o }
}

export const setting = {
  boolean: <const O extends Common & WithDefault<boolean>>(o: O) => ({ kind: 'boolean', ...o }) as SettingEntry<Value<boolean, O>, 'boolean'> & O,
  integer: <const O extends Common & WithDefault<number> & { min?: number, max?: number, unit?: string }>(o: O) => ({ kind: 'integer', ...o }) as SettingEntry<Value<number, O>, 'integer'> & O,
  /** Whole minor units in the theatre's currency. */
  money: <const O extends Common & WithDefault<number> & { min?: number, max?: number }>(o: O) => ({ kind: 'money', ...o }) as SettingEntry<Value<number, O>, 'money'> & O,
  /** Written '30m', '2h', '14d'; read as whole seconds. */
  duration: <const O extends Common & WithDefault<string> & { min?: string, max?: string, units?: readonly DurationUnit[] }>(o: O) => ({ kind: 'duration', ...o }) as SettingEntry<Value<number, O>, 'duration'> & O,
  /** HH:MM in the theatre's time zone; limits written the same way. */
  time: <const O extends Common & WithDefault<string> & { min?: string, max?: string }>(o: O) => ({ kind: 'time', ...o }) as SettingEntry<Value<string, O>, 'time'> & O,
  text: <const O extends Common & WithDefault<string> & { maxLength: number, minLength?: number, multiline?: boolean }>(o: O) => ({ kind: 'text', ...o }) as SettingEntry<Value<string, O>, 'text'> & O,
  choice,
  list: <const O extends Common & WithDefault<readonly string[]> & { of: 'text' | 'choice', options?: readonly string[], catalogue?: Catalogue, maxLength?: number, choices?: string }>(o: O) => ({ kind: 'list', ...o }) as SettingEntry<Value<string[], O>, 'list'> & O,
  /** A record of the named type. Always starts unset. */
  reference: <const O extends Common & { record: string }>(o: O) => ({ kind: 'reference', unset: true, ...o }) as SettingEntry<string | null, 'reference'> & O,
  /** The escape hatch: anything a Zod schema accepts. Needs its own editor; never quotable. */
  custom: <S extends z.ZodType, const O extends Common & { schema: S, default?: z.infer<S>, unset?: boolean }>(o: O & { schema: S }) => ({ kind: 'custom', ...o }) as SettingEntry<z.infer<S>, 'custom'> & O,
  /** A count in a period, from 1 to 10,000 in 1 minute to 1 day: rate limits. */
  rate: <const O extends Common & WithDefault<RateInput>>(o: O) => ({ kind: 'rate', ...o }) as SettingEntry<Value<Rate, O>, 'rate'> & O,
  /** A colour such as #1d4ed8, checked for contrast against `on` where given. */
  colour: <const O extends Common & WithDefault<string> & { on?: string }>(o: O) => ({ kind: 'colour', ...o }) as SettingEntry<Value<string, O>, 'colour'> & O,
}

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
/** A choice's option may also be a number, such as a page size of 25. */
const OPTION = /^[a-z0-9]+(-[a-z0-9]+)*$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const COLOUR = /^#[0-9a-f]{6}$/i
const SCREEN = /^\/(admin|console)(\/[a-z0-9-]+)+$/

/**
 * A module's settings. Keys are written short (`holds.release-before`) and stored full
 * (`box-office.holds.release-before`), so a module cannot declare a key outside its own name.
 */
export function defineSettings<const M extends string, const S extends Record<string, SettingEntry<any, any>>>(module: M, entries: S): { [K in keyof S & string as `${M}.${K}`]: S[K] } {
  const out: Record<string, SettingEntry> = {}
  for (const [short, entry] of Object.entries(entries)) {
    const key = `${module}.${short}`
    const parts = short.split('.')
    if (parts.length !== 2 || !parts.every(p => KEBAB.test(p))) throw new DeclarationError(`settings.${short}`, 'a setting key is `<group>.<name>`, two kebab-case segments')
    checkEntry(key, entry)
    out[key] = entry
  }
  return out as any
}

export interface SettingRule {
  id: string
  /** Given every setting of the module by short key; true when the values may stand together. */
  check: (values: Record<string, any>) => boolean | Promise<boolean>
}

/** Rules across two or more settings, checked on every save. The message is `<module>.settings.rules.<id>`. */
export function defineSettingRules(module: string, rules: SettingRule[]): { module: string, rules: SettingRule[] } {
  for (const rule of rules) if (!KEBAB.test(rule.id)) throw new DeclarationError(`settingRules.${rule.id}`, 'a rule id is kebab-case')
  return { module, rules }
}

function checkEntry(key: string, entry: SettingEntry) {
  const f = (name: string) => `settings.${key}.${name}`
  if (!entry || !KINDS.includes(entry.kind as SettingKind)) throw new DeclarationError(f('kind'), 'declare a setting with setting.<kind>({...})')
  if (entry.whenModule !== undefined && !KEBAB.test(entry.whenModule)) throw new DeclarationError(f('whenModule'), 'name the module the setting applies with as its kebab-case id')
  if (typeof entry.change !== 'string' || !entry.change) throw new DeclarationError(f('change'), 'every setting names the ability needed to change it')
  const audience = entry.audience ?? 'staff'
  if (!['public', 'signed-in', 'staff'].includes(audience)) throw new DeclarationError(f('audience'), "is 'public', 'signed-in' or 'staff'")
  if (entry.quotable && audience !== 'public') throw new DeclarationError(f('quotable'), "a quotable setting needs audience: 'public'")
  if (entry.quotable && entry.kind === 'custom') throw new DeclarationError(f('quotable'), 'a custom setting cannot be quoted')
  if (entry.sensitive && (entry.quotable || audience === 'public')) throw new DeclarationError(f('sensitive'), 'a sensitive setting can be neither public nor quotable')
  if (entry.kind === 'reference' && entry.default !== undefined) throw new DeclarationError(f('default'), 'a reference setting always starts unset')
  if (!entry.unset && entry.default === undefined) throw new DeclarationError(f('default'), 'give a default, or `unset: true` if the theatre must choose')
  if (entry.kind === 'text' && !(typeof entry.maxLength === 'number' && entry.maxLength > 0)) throw new DeclarationError(f('maxLength'), 'a text setting declares maxLength')
  if (entry.kind === 'choice' || (entry.kind === 'list' && entry.of === 'choice')) {
    if (entry.catalogue !== undefined) {
      if (!isCatalogue(entry.catalogue)) throw new DeclarationError(f('catalogue'), 'names one of the kit\'s catalogues: time-zone, currency, country or language')
      if (entry.options !== undefined) throw new DeclarationError(f('options'), 'a choice lists its own options or names a catalogue, not both')
    }
    else if (!(Array.isArray(entry.options) && entry.options.length && entry.options.every(o => OPTION.test(o))))
      throw new DeclarationError(f('options'), 'a choice lists its options, each kebab-case or a number, or names a catalogue')
  }
  else if (entry.catalogue !== undefined) throw new DeclarationError(f('catalogue'), 'only a choice, or a list of choices, names a catalogue')
  if (entry.choices !== undefined && !(entry.kind === 'list' && entry.of === 'text' && typeof entry.choices === 'string' && entry.choices.startsWith('/api/'))) throw new DeclarationError(f('choices'), 'only a list of text names a route to pick its values from, such as /api/core/policies/choices')
  if (entry.onChange !== undefined && !['reason', 'confirm'].includes(entry.onChange)) throw new DeclarationError(f('onChange'), "is 'reason' or 'confirm'")
  if ('scope' in entry) throw new DeclarationError(f('scope'), 'is gone: say where a group of settings is shown in the manifest\'s settingGroups')
  if (entry.screen !== undefined && !(typeof entry.screen === 'string' && SCREEN.test(entry.screen))) throw new DeclarationError(f('screen'), 'is the address of a page, such as /admin/email')
  if (entry.multiline !== undefined && !(entry.kind === 'text' && typeof entry.multiline === 'boolean')) throw new DeclarationError(f('multiline'), 'only a text setting is multiline, true or false')
  if (entry.kind === 'text' && entry.minLength !== undefined && !(Number.isInteger(entry.minLength) && entry.minLength >= 0 && entry.minLength <= entry.maxLength!)) throw new DeclarationError(f('minLength'), 'a whole number no larger than maxLength')
  if (entry.kind === 'time') {
    for (const limit of ['min', 'max'] as const) if (entry[limit] !== undefined && !(typeof entry[limit] === 'string' && TIME.test(entry[limit]))) throw new DeclarationError(f(limit), 'a time limit is written like 08:00')
  }
  if (entry.kind === 'duration') {
    for (const limit of ['min', 'max'] as const) if (entry[limit] !== undefined && !isDuration(entry[limit])) throw new DeclarationError(f(limit), 'a duration limit is written like 30m, 2h or 14d')
    if (entry.units !== undefined && !(entry.units.length && entry.units.every(u => DURATION_UNITS.some(([unit]) => unit === u)))) throw new DeclarationError(f('units'), 'one or more units of time, such as day and week')
  }
  if (entry.default !== undefined && entry.default !== null) {
    const result = validateSettingValue(entry, entry.default)
    if (!result.ok) throw new DeclarationError(f('default'), `the default is outside the setting's own limits: ${result.reason}`)
  }
}

export type Validated = { ok: true, value: unknown } | { ok: false, reason: string, limit?: string }

/**
 * Checks a value offered for a setting and returns it in its stored form (durations become
 * seconds). Used on the screen, by the settings route and on every declared default.
 */
export function validateSettingValue(entry: SettingEntry, raw: unknown): Validated {
  if (raw === null) return entry.unset ? { ok: true, value: null } : { ok: false, reason: 'this setting must have a value' }
  const range = (n: number, min?: number, max?: number, show: (v: number) => string = String): Validated => {
    if (min !== undefined && n < min) return { ok: false, reason: `must be at least ${show(min)}`, limit: 'min' }
    if (max !== undefined && n > max) return { ok: false, reason: `must be at most ${show(max)}`, limit: 'max' }
    return { ok: true, value: n }
  }
  switch (entry.kind) {
    case 'boolean':
      return typeof raw === 'boolean' ? { ok: true, value: raw } : { ok: false, reason: 'must be yes or no' }
    case 'integer':
    case 'money':
      if (typeof raw !== 'number' || !Number.isInteger(raw)) return { ok: false, reason: entry.kind === 'money' ? 'must be a whole number of pence' : 'must be a whole number' }
      return range(raw, entry.min as number | undefined, entry.max as number | undefined)
    case 'duration': {
      let seconds: number
      try { seconds = parseDuration(raw as string | number) }
      catch { return { ok: false, reason: 'must be a duration such as 30m, 2h or 14d' } }
      return range(seconds, entry.min !== undefined ? parseDuration(entry.min as string) : undefined, entry.max !== undefined ? parseDuration(entry.max as string) : undefined, formatDuration)
    }
    case 'time':
      if (!(typeof raw === 'string' && TIME.test(raw))) return { ok: false, reason: 'must be a time such as 09:30' }
      // HH:MM strings sort as times do.
      if (typeof entry.min === 'string' && raw < entry.min) return { ok: false, reason: `must be ${entry.min} or later`, limit: 'min' }
      if (typeof entry.max === 'string' && raw > entry.max) return { ok: false, reason: `must be ${entry.max} or earlier`, limit: 'max' }
      return { ok: true, value: raw }
    case 'text':
      if (typeof raw !== 'string') return { ok: false, reason: 'must be text' }
      if (entry.minLength && raw.length < entry.minLength) return { ok: false, reason: `must be at least ${entry.minLength} ${entry.minLength === 1 ? 'character' : 'characters'}`, limit: 'minLength' }
      return raw.length <= entry.maxLength! ? { ok: true, value: raw } : { ok: false, reason: `must be at most ${entry.maxLength} characters`, limit: 'maxLength' }
    case 'choice':
      return typeof raw === 'string' && optionsOf(entry).includes(raw) ? { ok: true, value: raw } : { ok: false, reason: `must be ${oneOf(entry)}`, limit: 'options' }
    case 'list': {
      if (!Array.isArray(raw) || !raw.every(i => typeof i === 'string')) return { ok: false, reason: 'must be a list of text' }
      if (entry.of === 'choice' && !raw.every(i => optionsOf(entry).includes(i))) return { ok: false, reason: `each item must be ${oneOf(entry)}`, limit: 'options' }
      if (entry.maxLength && raw.some(i => i.length > entry.maxLength!)) return { ok: false, reason: `each item must be at most ${entry.maxLength} characters`, limit: 'maxLength' }
      return { ok: true, value: raw }
    }
    case 'reference':
      return typeof raw === 'string' && /^[a-z]{2,4}_[2-7a-z]{26}$/.test(raw) ? { ok: true, value: raw } : { ok: false, reason: 'must be the id of a record' }
    case 'colour':
      return typeof raw === 'string' && COLOUR.test(raw) ? { ok: true, value: raw.toLowerCase() } : { ok: false, reason: 'must be a colour such as #1d4ed8' }
    case 'rate': {
      const r = raw as { count?: unknown, per?: unknown }
      if (!r || typeof r !== 'object' || typeof r.count !== 'number' || !Number.isInteger(r.count)) return { ok: false, reason: 'must be a whole number of times in a period, such as 10 in 10m' }
      if (r.count < RATE_COUNT.min || r.count > RATE_COUNT.max) return { ok: false, reason: `must be between ${RATE_COUNT.min} and ${RATE_COUNT.max.toLocaleString('en-GB')} times`, limit: 'count' }
      let per: number
      try { per = parseDuration(r.per as string | number) }
      catch { return { ok: false, reason: 'must have a period such as 1m, 10m or 1h' } }
      if (per < parseDuration(RATE_PERIOD.min) || per > parseDuration(RATE_PERIOD.max)) return { ok: false, reason: 'must have a period between 1 minute and 1 day', limit: 'per' }
      return { ok: true, value: { count: r.count, per } }
    }
    case 'custom': {
      const parsed = entry.schema!.safeParse(raw)
      return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: parsed.error.issues[0]?.message ?? 'is not valid' }
    }
  }
  return { ok: false, reason: 'unknown kind' }
}

/** The values a choice (or a list of choices) allows: its own options, or its catalogue's. */
export function optionsOf(entry: SettingEntry): readonly string[] {
  return entry.catalogue ? catalogueValues(entry.catalogue) : entry.options ?? []
}

const CATALOGUE_WORDS: Record<Catalogue, string> = { 'time-zone': 'a time zone such as Europe/London', 'currency': 'a currency code such as GBP', 'country': 'a country code such as GB', 'language': 'a language the site is written in, such as en-GB' }
const oneOf = (entry: SettingEntry) => entry.catalogue ? CATALOGUE_WORDS[entry.catalogue] : `one of ${entry.options!.join(', ')}`

/** The value a setting has with no override: its default in stored form, or null when unset. */
export function defaultValue(entry: SettingEntry): unknown {
  if (entry.default === undefined) return null
  const result = validateSettingValue(entry, entry.default)
  return result.ok ? result.value : null
}

/** How a content token shows a value: "30 minutes", "8 seats", "£12.50", "yes". */
export function formatSetting(entry: SettingEntry, value: unknown, options: { unitLabel?: string, currency?: string } = {}): string {
  const { unitLabel, currency = 'GBP' } = options
  if (value === null || value === undefined) return ''
  switch (entry.kind) {
    case 'boolean': return value ? 'yes' : 'no'
    case 'duration': return formatDuration(value as number)
    case 'money': return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format((value as number) / 100) // not-policy: minor units per pound
    case 'integer': return unitLabel ? `${value} ${unitLabel}` : String(value)
    case 'time': {
      const [h, m] = (value as string).split(':').map(Number) as [number, number]
      return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}` // not-policy: a twelve-hour clock
    }
    case 'list': return (value as string[]).join(', ')
    case 'rate': {
      const { count, per } = value as Rate
      return `${count} in ${formatDuration(per)}`
    }
    default: return String(value)
  }
}
