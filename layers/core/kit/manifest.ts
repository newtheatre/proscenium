// The module manifest: `layers/<id>/module.ts`, default export `defineModule({...})`. Pure data,
// read by the build, the checks and the running app alike (Module manifest tab).
import { z } from 'zod'
import { DeclarationError } from './refusal'
import { isDuration, parseDuration } from './duration'
import { tableMeta } from './db'
import type { SettingEntry, SettingRule } from './settings'
import type { AbilityDecl, FactDecl, RecordDecl } from './abilities'

/** The `events.listens` key for the listener that hears every event not marked internal. */
export const DELIVERABLE = 'deliverable'

export interface EventDecl<P extends z.ZodObject<any> = z.ZodObject<any>> {
  version: number
  payload: P
  /** Kept off webhooks: the fact that it happened should not leave the system. */
  internal?: boolean
}
export interface JobDecl<P extends z.ZodType = z.ZodType> {
  payload: P
  /** Attempts before the job is dead. Default from core.jobs.attempts. */
  retries?: number
  lane?: 'prompt' | 'bulk'
}
export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
export interface TaskDecl {
  /** A whole number of minutes or hours: '5m', '1h'. */
  every?: string
  /** HH:MM in the theatre's time zone. */
  dailyAt?: string
  weeklyOn?: { day: Weekday, at: string }
}
export type PointDecl = { kind: 'data', schema: z.ZodType } | { kind: 'code', contract: string }
export interface SecretDecl { needed: 'always' | 'when-used' | 'optional' }
export interface CredentialDecl {
  needed: 'always' | 'when-used' | 'optional'
  /**
   * The ability that may save or remove it on the shared keys form (KeysCard), for a credential the
   * site has one of. Left out for one saved per record on its own screen, as a payment provider
   * account's keys are. Saving always asks for a fresh sign-in.
   */
  manage?: string
  /** Replacing or removing it breaks what was made with the old value, so the form asks first. */
  confirm?: boolean
}
/**
 * One purpose a module signs under (F-37). The kit makes the key pair, makes a new current key every
 * `rotateEvery`, and keeps an old key for checking for `keepFor` after it stops signing, so anything
 * signed under the purpose can be checked for at least that long.
 */
export interface SigningDecl { purpose: string, rotateEvery: string, keepFor: string }
export interface CallDecl {
  /** After how long an attempt with no outcome is handed to the reconcile handler. Default core.external.reconcile-after. */
  reconcileAfter?: string
}
export interface Contribution { id: string, file?: string, [field: string]: unknown }
export interface Preset {
  on?: boolean
  settings?: Record<string, unknown>
  roles?: Record<string, string[]>
  facts?: Record<string, string[]>
}

/** Where a page of settings is: always Admin. Console staff open it from the cog on the page it governs. */
export type SettingPlace = 'admin'
/**
 * Where a group of settings (the first part of a short key, such as `sign-in`) is shown. Exactly one
 * home: a page of the module's own (`page`), the shared Advanced page (`advanced`), or a bespoke
 * screen that manages it (`screen`, left off every generated page). With none, the group is on the
 * module's own page, Admin's page for the module (/admin/modules/<module>). Core has no page of its
 * own, so each of its groups names one.
 */
export interface SettingGroupDecl { place?: SettingPlace, page?: string, advanced?: boolean, screen?: string }
/**
 * A generated page of settings, declared once; it also makes the page's navigation entry. `group`
 * is the navigation group it sits in. `to` defaults to /admin/<page> for core, and
 * /admin/modules/<module>/<page> for another module.
 */
export interface SettingPageDecl {
  place: SettingPlace
  group: string
  order?: number
  icon?: string
  to?: string
  /** For a page in Admin's Modules: the console entries or groups whose settings window shows it (see the manifest's settingsIn). */
  settingsIn?: readonly string[]
}

export interface ModuleManifest {
  id: string
  manifest: 1
  since: string
  stability?: 'experimental' | 'stable' | 'deprecated'
  /** false: has its own layer and id but is always on. */
  switchable?: boolean
  /**
   * true: a new site starts with it on. First-run setup switches it on, unless someone has already
   * switched it either way, and the module may treat itself as on before then (maintenance mode,
   * so a new site is closed until its Owner opens it).
   */
  onAtSetup?: boolean
  requires?: readonly string[]
  uses?: readonly string[]
  settings?: Record<string, SettingEntry<any, any>>
  settingRules?: { module: string, rules: SettingRule[] }
  settingGroups?: Record<string, SettingGroupDecl>
  settingPages?: Record<string, SettingPageDecl>
  /**
   * Where the console's settings window shows this module's tabs from its page in Admin: console
   * navigation entry ids (core.productions) or console group ids (membership). Left out, the window
   * on any of the module's own console pages shows them. A tab's own settingsIn wins over this.
   */
  settingsIn?: readonly string[]
  abilities?: Record<string, AbilityDecl>
  facts?: Record<string, FactDecl>
  records?: Record<string, RecordDecl>
  tables?: Record<string, unknown>
  /**
   * `listens` maps an event name to a listener file. The key `deliverable` is the listener declared
   * on: 'deliverable': it hears every event not marked internal. Only core may declare it.
   */
  events?: { announces?: Record<string, EventDecl<any>>, listens?: Record<string, string> }
  jobs?: Record<string, JobDecl<any>>
  tasks?: Record<string, TaskDecl>
  calls?: Record<string, CallDecl>
  points?: Record<string, PointDecl>
  contributes?: Record<string, Contribution[]>
  secrets?: Record<string, SecretDecl>
  credentials?: Record<string, CredentialDecl>
  signing?: readonly SigningDecl[]
  presets?: Partial<Record<PresetId, Preset>>
}

export const PRESETS = ['student-society', 'amateur-company', 'small-venue'] as const
export type PresetId = typeof PRESETS[number]

export const event = <const P extends z.ZodObject<any>>(d: EventDecl<P>): EventDecl<P> => d
export const job = <P extends z.ZodType>(d: JobDecl<P>): JobDecl<P> => d
export const task = (d: TaskDecl): TaskDecl => d
export const point = (d: PointDecl): PointDecl => d
export const secret = (d: SecretDecl): SecretDecl => d
export const credential = (d: CredentialDecl): CredentialDecl => d
export const call = (d: CallDecl = {}): CallDecl => d

/**
 * A machine code in an event payload or audit detail: lower-case, kebab or dotted, never a person's
 * words. Event payload strings must be ids (`*Id`, `*Ids`), enums, literals or `code()`.
 */
export const code = () => z.string().regex(/^[a-z0-9]+([.-][a-z0-9]+)*$/).describe('code')

/** Declares a module. Validated here and again, across modules, when the registry is built. */
export function defineModule<const M extends ModuleManifest>(manifest: M): M {
  validateManifest(manifest)
  return manifest
}

const SIGNING_MIN = 86_400 // not-policy: a signing key lives at least a day, in seconds
const KEBAB = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*'
const kebab = new RegExp(`^${KEBAB}$`)
const SEMVER = /^\d+\.\d+\.\d+(-[0-9a-z.-]+)?$/
const FIELDS = new Set(['id', 'manifest', 'since', 'stability', 'switchable', 'onAtSetup', 'requires', 'uses', 'settings', 'settingRules', 'settingGroups', 'settingPages', 'settingsIn', 'abilities', 'facts', 'records', 'tables', 'events', 'jobs', 'tasks', 'calls', 'points', 'contributes', 'secrets', 'credentials', 'signing', 'presets'])
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function snake(id: string): string {
  return id.replace(/-/g, '_')
}

/** The manifest's own rules. Cross-module rules are in the registry. Throws a DeclarationError naming the field. */
export function validateManifest(m: ModuleManifest): void {
  if (!m || typeof m !== 'object') throw new DeclarationError('(manifest)', 'the default export must be defineModule({...})')
  for (const key of Object.keys(m)) if (!FIELDS.has(key)) throw new DeclarationError(key, `is not a manifest field. Fields are: ${[...FIELDS].join(', ')}`)
  if (typeof m.id !== 'string' || !kebab.test(m.id)) throw new DeclarationError('id', 'is required and kebab-case, such as box-office')
  if (m.manifest !== 1) throw new DeclarationError('manifest', 'must be 1, the version of this format')
  if (typeof m.since !== 'string' || !SEMVER.test(m.since)) throw new DeclarationError('since', 'is the release the module first shipped in, such as 0.3.0')
  if (m.stability !== undefined && !['experimental', 'stable', 'deprecated'].includes(m.stability)) throw new DeclarationError('stability', "is 'experimental', 'stable' or 'deprecated'")
  if (m.switchable !== undefined && typeof m.switchable !== 'boolean') throw new DeclarationError('switchable', 'is true or false')
  if (m.onAtSetup !== undefined && typeof m.onAtSetup !== 'boolean') throw new DeclarationError('onAtSetup', 'is true or false')
  if (m.onAtSetup && m.switchable === false) throw new DeclarationError('onAtSetup', 'is for a module that can be switched; one that cannot is always on')
  const id = m.id
  const own = (kind: string, rest: string) => new RegExp(`^${escape(id)}\\.${rest}$`)

  for (const field of ['requires', 'uses'] as const) {
    const list = m[field]
    if (list === undefined) continue
    if (!Array.isArray(list)) throw new DeclarationError(field, 'is a list of module ids')
    for (const other of list) {
      if (typeof other !== 'string' || !kebab.test(other)) throw new DeclarationError(field, `"${other}" is not a module id`)
      if (other === 'core') throw new DeclarationError(field, 'core is always on and never listed')
      if (other === id) throw new DeclarationError(field, 'a module cannot list itself')
    }
  }
  for (const other of m.requires ?? []) if (m.uses?.includes(other)) throw new DeclarationError('uses', `${other} is already in requires`)

  for (const key of Object.keys(m.settings ?? {})) {
    if (!key.startsWith(`${id}.`)) throw new DeclarationError(`settings.${key}`, `belongs to another module: use defineSettings('${id}', {...})`)
  }
  if (m.settingRules && m.settingRules.module !== id) throw new DeclarationError('settingRules', `use defineSettingRules('${id}', [...])`)
  validateSettingPlaces(m)
  if (m.settingsIn !== undefined && !validPlaces(m.settingsIn)) throw new DeclarationError('settingsIn', 'is a list of console entry or group ids, such as core.productions or membership')
  for (const key of Object.keys(m.abilities ?? {})) if (!own('', `${KEBAB}\\.${KEBAB}`).test(key)) throw new DeclarationError(`abilities.${key}`, `is <module>.<record>.<verb>: use defineAbilities('${id}', {...})`)
  for (const key of Object.keys(m.facts ?? {})) if (!own('', KEBAB).test(key)) throw new DeclarationError(`facts.${key}`, `is <module>.<name>: use defineFacts('${id}', {...})`)
  for (const key of Object.keys(m.records ?? {})) if (!own('', KEBAB).test(key)) throw new DeclarationError(`records.${key}`, `is <module>.<noun>: use defineRecords('${id}', {...})`)

  for (const [key, table] of Object.entries(m.tables ?? {})) {
    const meta = tableMeta(table)
    if (!meta) throw new DeclarationError(`tables.${key}`, 'is not a table: declare it with defineTable from #kit/db')
    if (!meta.name.startsWith(`${snake(id)}_`)) throw new DeclarationError(`tables.${key}`, `"${meta.name}" must start with ${snake(id)}_`)
  }

  const events = m.events ?? {}
  for (const key of Object.keys(events)) if (key !== 'announces' && key !== 'listens') throw new DeclarationError(`events.${key}`, 'events has announces and listens')
  for (const [name, decl] of Object.entries(events.announces ?? {})) {
    const f = `events.announces.${name}`
    if (!own('', `${KEBAB}\\.${KEBAB}`).test(name)) throw new DeclarationError(f, 'an event is <module>.<record>.<past participle>, announced by its own module')
    if (!decl || !Number.isInteger(decl.version) || decl.version < 1) throw new DeclarationError(`${f}.version`, 'is a whole number from 1')
    if (!(decl.payload instanceof z.ZodObject)) throw new DeclarationError(`${f}.payload`, 'is a z.object({...})')
    checkPayload(f, decl.payload)
  }
  for (const [name, listener] of Object.entries(events.listens ?? {})) {
    if (name === DELIVERABLE) {
      if (m.id !== 'core') throw new DeclarationError(`events.listens.${name}`, "only core may listen on: 'deliverable'; the webhook sender is its one user")
      if (typeof listener !== 'string' || !kebab.test(listener)) throw new DeclarationError(`events.listens.${name}`, 'names a listener file under server/listeners/, kebab-case')
      continue
    }
    if (!new RegExp(`^${KEBAB}\\.${KEBAB}\\.${KEBAB}$`).test(name)) throw new DeclarationError(`events.listens.${name}`, 'is an event name')
    if (typeof listener !== 'string' || !kebab.test(listener)) throw new DeclarationError(`events.listens.${name}`, 'names a listener file under server/listeners/, kebab-case')
  }

  const work = own('', '[a-z]+(?:-[a-z0-9]+)+')
  for (const [name, decl] of Object.entries(m.jobs ?? {})) {
    const f = `jobs.${name}`
    if (!work.test(name)) throw new DeclarationError(f, 'a job is <module>.<verb>-<noun>')
    if (!decl || !(decl.payload instanceof z.ZodType)) throw new DeclarationError(`${f}.payload`, 'is a Zod schema')
    if (decl.retries !== undefined && !(Number.isInteger(decl.retries) && decl.retries >= 1)) throw new DeclarationError(`${f}.retries`, 'is a whole number from 1')
    if (decl.lane !== undefined && !['prompt', 'bulk'].includes(decl.lane)) throw new DeclarationError(`${f}.lane`, "is 'prompt' or 'bulk'")
  }
  for (const [name, decl] of Object.entries(m.tasks ?? {})) {
    const f = `tasks.${name}`
    if (!work.test(name)) throw new DeclarationError(f, 'a task is <module>.<verb>-<noun>')
    const given = ['every', 'dailyAt', 'weeklyOn'].filter(k => (decl as any)?.[k] !== undefined)
    if (given.length !== 1) throw new DeclarationError(f, 'give exactly one of every, dailyAt or weeklyOn')
    if (decl.every !== undefined && !/^\d+[mh]$/.test(decl.every)) throw new DeclarationError(`${f}.every`, "is a whole number of minutes or hours, such as '5m' or '1h'")
    const at = decl.dailyAt ?? decl.weeklyOn?.at
    if (at !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) throw new DeclarationError(`${f}.${decl.dailyAt ? 'dailyAt' : 'weeklyOn.at'}`, 'is a time such as 06:00')
    if (decl.weeklyOn && !['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(decl.weeklyOn.day)) throw new DeclarationError(`${f}.weeklyOn.day`, 'is a day of the week, such as monday')
  }
  for (const [name, decl] of Object.entries(m.calls ?? {})) {
    if (!work.test(name)) throw new DeclarationError(`calls.${name}`, 'an external call is <module>.<verb>-<noun>')
    if (decl?.reconcileAfter !== undefined && !isDuration(decl.reconcileAfter)) throw new DeclarationError(`calls.${name}.reconcileAfter`, 'is a duration such as 5m')
  }
  for (const [name, decl] of Object.entries(m.points ?? {})) {
    const f = `points.${name}`
    if (!own('', KEBAB).test(name)) throw new DeclarationError(f, 'a point is <module>.<noun>')
    if (decl?.kind === 'data' && !(decl.schema instanceof z.ZodType)) throw new DeclarationError(`${f}.schema`, 'a data point has a Zod schema')
    else if (decl?.kind === 'code' && !(typeof decl.contract === 'string' && kebab.test(decl.contract))) throw new DeclarationError(`${f}.contract`, 'a code point names its contract file under server/points/')
    else if (decl?.kind !== 'data' && decl?.kind !== 'code') throw new DeclarationError(`${f}.kind`, "is 'data' or 'code'")
  }
  for (const [name, list] of Object.entries(m.contributes ?? {})) {
    const f = `contributes.${name}`
    if (!new RegExp(`^${KEBAB}\\.${KEBAB}$`).test(name)) throw new DeclarationError(f, 'names a point, <module>.<noun>')
    if (!Array.isArray(list)) throw new DeclarationError(f, 'is a list of contributions')
    const seen = new Set<string>()
    for (const c of list) {
      if (!c || typeof c.id !== 'string' || !c.id) throw new DeclarationError(f, 'every contribution has an id')
      if (seen.has(c.id)) throw new DeclarationError(`${f}.${c.id}`, 'is listed twice')
      seen.add(c.id)
    }
  }
  const SECRET = new RegExp(`^${snake(id).toUpperCase()}_[A-Z0-9]+(_[A-Z0-9]+)*$`)
  for (const section of ['secrets', 'credentials'] as const) {
    for (const [name, decl] of Object.entries(m[section] ?? {})) {
      if (!SECRET.test(name)) throw new DeclarationError(`${section}.${name}`, `is ${snake(id).toUpperCase()}_<NAME> in capitals`)
      if (!['always', 'when-used', 'optional'].includes(decl?.needed)) throw new DeclarationError(`${section}.${name}.needed`, "is 'always', 'when-used' or 'optional'")
      if (section === 'credentials') {
        const c = decl as CredentialDecl
        if (c.manage !== undefined && !(typeof c.manage === 'string' && /^[a-z][a-z0-9-]*\.[a-z][a-z0-9.-]*$/.test(c.manage))) throw new DeclarationError(`${section}.${name}.manage`, 'is the ability that manages it, <module>.<ability>') // not-policy: an ability's name
        if (c.confirm !== undefined && typeof c.confirm !== 'boolean') throw new DeclarationError(`${section}.${name}.confirm`, 'is true or false')
      }
    }
  }
  if (m.signing !== undefined) {
    if (!Array.isArray(m.signing)) throw new DeclarationError('signing', 'is a list of { purpose, rotateEvery, keepFor }')
    const seen = new Set<string>()
    for (const [i, decl] of m.signing.entries()) {
      const f = `signing[${i}]`
      if (!decl || typeof decl.purpose !== 'string' || !own('', KEBAB).test(decl.purpose)) throw new DeclarationError(`${f}.purpose`, `is <module>.<noun>, under the module's own id, such as ${id}.door-code`)
      if (seen.has(decl.purpose)) throw new DeclarationError(`${f}.purpose`, `${decl.purpose} is listed twice`)
      seen.add(decl.purpose)
      for (const key of ['rotateEvery', 'keepFor'] as const) {
        if (typeof decl[key] !== 'string' || !isDuration(decl[key]) || parseDuration(decl[key]) < SIGNING_MIN) throw new DeclarationError(`${f}.${key}`, "is a duration of at least a day, such as '90d'")
      }
    }
  }
  for (const [preset, value] of Object.entries(m.presets ?? {})) {
    if (!(PRESETS as readonly string[]).includes(preset)) throw new DeclarationError(`presets.${preset}`, `is not a preset. Presets are ${PRESETS.join(', ')}`)
    for (const key of Object.keys(value?.settings ?? {})) if (!(key in (m.settings ?? {}))) throw new DeclarationError(`presets.${preset}.settings.${key}`, `is not a setting of ${id}`)
  }
}

/**
 * Payloads carry identifiers, never people (E7). A string field is allowed only when its name ends
 * in Id or Ids, or it is an enum, a literal or a `code()`. Numbers and booleans are fine.
 */
function checkPayload(field: string, schema: z.ZodObject<any>) {
  for (const [key, value] of Object.entries(schema.shape as Record<string, z.ZodType>)) {
    let inner: any = value
    while (inner?.def?.innerType || inner?.def?.type === 'array') inner = inner.def.innerType ?? inner.def.element
    const type = inner?.def?.type
    if (type === 'string') {
      const named = /Ids?$/.test(key)
      const isCode = inner.description === 'code'
      if (!named && !isCode) throw new DeclarationError(`${field}.payload.${key}`, 'a payload string must be an id (name it ...Id), an enum, a literal or code(): never a name, an address or free text')
    }
    else if (type === 'object') {
      checkPayload(`${field}.payload.${key}`, inner)
    }
    else if (!['number', 'boolean', 'enum', 'literal', 'int', 'bigint'].includes(type)) {
      throw new DeclarationError(`${field}.payload.${key}`, `a payload field of type ${type} cannot be checked for personal data; use ids, enums, numbers or booleans`)
    }
  }
}

const PLACES = ['admin']
const PLACE_RULE = "is 'admin': no page of settings is made in the console, whose staff open settings from the cog on the page they govern"
const ADDRESS = /^\/(admin|console)(\/[a-z0-9-]+)+$/

const validPlaces = (list: unknown) => Array.isArray(list) && list.length > 0 && list.every(x => typeof x === 'string' && /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/.test(x))

/** settingGroups and settingPages: their shapes, and that every group names at most one home. */
function validateSettingPlaces(m: ModuleManifest): void {
  const pages = m.settingPages ?? {}
  for (const [page, decl] of Object.entries(pages)) {
    const f = (name: string) => `settingPages.${page}.${name}`
    if (!kebab.test(page)) throw new DeclarationError(`settingPages.${page}`, 'a page id is kebab-case')
    if (!decl || !PLACES.includes(decl.place)) throw new DeclarationError(f('place'), PLACE_RULE)
    if (typeof decl.group !== 'string' || !kebab.test(decl.group)) throw new DeclarationError(f('group'), 'names the navigation group the page sits in')
    if (decl.to !== undefined && !(typeof decl.to === 'string' && ADDRESS.test(decl.to) && decl.to.startsWith(`/${decl.place}/`))) throw new DeclarationError(f('to'), `is an address under /${decl.place}`)
    if (decl.order !== undefined && !Number.isInteger(decl.order)) throw new DeclarationError(f('order'), 'is a whole number')
    if (decl.settingsIn !== undefined && !validPlaces(decl.settingsIn)) throw new DeclarationError(f('settingsIn'), 'is a list of console entry or group ids, such as core.productions or membership')
  }
  for (const [group, decl] of Object.entries(m.settingGroups ?? {})) {
    const f = (name: string) => `settingGroups.${group}.${name}`
    if (!kebab.test(group)) throw new DeclarationError(`settingGroups.${group}`, 'a group is the first part of a setting\'s short key, kebab-case')
    if (!decl || typeof decl !== 'object') throw new DeclarationError(`settingGroups.${group}`, 'is { place, page }, { advanced: true } or { screen }')
    for (const key of Object.keys(decl)) if (!['place', 'page', 'advanced', 'screen'].includes(key)) throw new DeclarationError(f(key), 'is not a field of a setting group: place, page, advanced or screen')
    if (decl.place !== undefined && !PLACES.includes(decl.place)) throw new DeclarationError(f('place'), PLACE_RULE)
    const homes = [decl.page !== undefined, decl.advanced === true, decl.screen !== undefined].filter(Boolean).length
    if (homes > 1) throw new DeclarationError(`settingGroups.${group}`, 'has one home: a page, the Advanced page or a bespoke screen, not more than one')
    if (decl.advanced !== undefined && decl.advanced !== true) throw new DeclarationError(f('advanced'), 'is true or left out')
    if (decl.page !== undefined && !(decl.page in pages)) throw new DeclarationError(f('page'), `"${decl.page}" is not one of ${m.id}'s settingPages`)
    if (decl.page !== undefined && decl.place !== undefined && pages[decl.page]!.place !== decl.place) throw new DeclarationError(f('place'), `the page "${decl.page}" is in ${pages[decl.page]!.place}`)
    if (decl.screen !== undefined && !(typeof decl.screen === 'string' && ADDRESS.test(decl.screen))) throw new DeclarationError(f('screen'), 'is the address of a page, such as /admin/email')
  }
  const groups = new Set(Object.keys(m.settings ?? {}).map(key => key.slice(m.id.length + 1).split('.')[0]!))
  for (const group of Object.keys(m.settingGroups ?? {})) if (!groups.has(group)) throw new DeclarationError(`settingGroups.${group}`, `${m.id} declares no setting in this group`)
  if (m.id === 'core') {
    for (const group of groups) {
      const decl = m.settingGroups?.[group]
      if (!decl || !(decl.page || decl.advanced || decl.screen)) throw new DeclarationError(`settingGroups.${group}`, 'core has no settings page of its own, so each of its groups names a page, advanced: true or a screen')
    }
  }
}
