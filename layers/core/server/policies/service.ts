// Policies at run time: which exist, what a condition or token may read, and which sections one
// shows. The sections come from the build (#policies); what is switched on and what each setting
// holds is read here, so a policy always says what the system does today.
import { formatSetting, isEnabled, useSetting, usePoint } from '#kit'
import { enabledModules } from '#kit/modules-store'
import { useRegistry } from '#kit/registry'
import { sections as allSections, sitePolicies } from '#policies'
import { allHold, readConditions, renderPolicy, selectSections, type PolicyContext, type PolicySection, type PolicyTable, type PolicyValue } from '../../shared/policies'
import type { PolicyFact } from '../points/policy-fact'

export type PolicyKind = 'notice' | 'terms' | 'rules' | 'statement'
export interface Policy {
  id: string
  title: string
  summary?: string
  order: number
  kind: PolicyKind
  accepted?: 'sign-up' | 'checkout' | 'joining'
  /** The module that declares it, or `site` for a theatre's own. */
  module: string
}

interface PolicyDecl { id: string, title: string, summary?: string, order: number, kind: PolicyKind, accepted?: Policy['accepted'] }

/** Every policy a switched-on module declares, and the theatre's own, in footer order. */
export async function listPolicies(): Promise<Policy[]> {
  const declared = (await usePoint<PolicyDecl>('core.policy')).map(c => ({ ...c.value, module: c.module }))
  const own = sitePolicies.filter(p => !declared.some(d => d.id === p.id)).map(p => ({ id: p.id, title: p.title, order: p.order, kind: p.kind, module: 'site' }))
  return [...declared, ...own].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

/** The settings a browser may know, with the text a token shows for each quotable one. */
export async function publicSettings(): Promise<Record<string, PolicyValue>> {
  const out: Record<string, PolicyValue> = {}
  const currency = await useSetting('core.locale.currency') as string
  for (const [key, { entry }] of useRegistry().settings) {
    if ((entry.audience ?? 'staff') !== 'public') continue
    if (!(await isEnabled(key.split('.')[0]!))) continue
    const value = await useSetting(key as never) as unknown
    out[key] = entry.quotable ? { value, text: formatSetting(entry, value, { currency }) } : { value }
  }
  return out
}

interface StorageDecl { id: string, names: string[], kind: 'cookie' | 'storage', purpose: string, lasts?: string, essential: boolean, staff?: boolean, order?: number }
interface SupplierDecl { id: string, name: string, purpose: string, when?: string, cookies?: { when: string, purpose: string }, order?: number }
interface RecordDecl { id: string, holds: string, why: string, basis?: string, keptFor: string, order?: number }

const UNORDERED = 1000 // not-policy: a line with no order of its own goes after those that have one
/** A point's lines in the order they are shown: by `order`, then by id. */
async function lines<T extends { id: string, order?: number }>(point: string): Promise<T[]> {
  return (await usePoint<T>(point)).map(c => c.value).sort((a, b) => (a.order ?? UNORDERED) - (b.order ?? UNORDERED) || a.id.localeCompare(b.id))
}

/** Words as declared, or the live value of the quotable setting they name. */
function wordsOrSetting(words: string | undefined, settings: Record<string, PolicyValue>): string {
  if (!words) return ''
  return settings[words]?.text ?? words
}

async function tables(context: Omit<PolicyContext, 'tables'>): Promise<Record<string, PolicyTable>> {
  const full = { ...context, tables: {} }
  const storage = (await lines<StorageDecl>('core.browser-storage')).filter(s => !s.staff)
  const suppliers = await lines<SupplierDecl>('core.supplier')
  const records = await lines<RecordDecl>('core.privacy-record')
  const applies = (when: string | undefined) => !when || allHold(readConditions(when), full)
  const code = (names: string[]) => names.map(n => `\`${n}\``).join(', ')
  return {
    'cookies': {
      headers: ['Name', 'What it is for', 'How long it lasts'],
      rows: storage.filter(s => s.kind === 'cookie').map(s => [code(s.names), s.purpose, wordsOrSetting(s.lasts, context.settings)]),
    },
    'browser-storage': {
      headers: ['What', 'What it is for'],
      rows: storage.filter(s => s.kind === 'storage').map(s => [s.names.join(', '), s.purpose]),
    },
    'suppliers': {
      headers: ['Who', 'What for'],
      rows: suppliers.filter(s => applies(s.when)).map(s => [s.name, s.purpose]),
    },
    'supplier-cookies': {
      headers: ['Who', 'When', 'What for'],
      rows: suppliers.filter(s => s.cookies && applies(s.when)).map(s => [s.name, s.cookies!.when, s.cookies!.purpose]),
    },
    'privacy-records': {
      headers: ['What we hold', 'Why', 'Our legal reason', 'How long we keep it'],
      rows: records.map(r => [r.holds, r.why, r.basis ?? '', wordsOrSetting(r.keptFor, context.settings)]),
    },
  }
}

/** What conditions and tokens read. Everything in it is already public. */
export async function policyContext(): Promise<PolicyContext> {
  const settings = await publicSettings()
  const facts: Record<string, PolicyValue> = {}
  for (const fact of await usePoint<PolicyFact>('core.policy-fact')) {
    // A fact that fails is left out, never the page: a condition on it then does not hold.
    try { facts[fact.id] = await fact.value.value() }
    catch { /* left out */ }
  }
  const partial = {
    settings,
    facts,
    modules: [...await enabledModules()].sort(),
    country: String(await useSetting('core.organisation.country') ?? '').toLowerCase(),
  }
  return { ...partial, tables: await tables(partial) }
}

export interface ResolvedPolicy {
  policy: Policy
  sections: PolicySection[]
  unwritten: PolicySection[]
  stale: { section: PolicySection, upstream: PolicySection }[]
  context: PolicyContext
  /** The latest `revised` among the sections shown. */
  revised: string | null
}

/** A policy as it stands now, or null where there is none of that name. */
export async function resolvePolicy(id: string, context?: PolicyContext): Promise<ResolvedPolicy | null> {
  const policy = (await listPolicies()).find(p => p.id === id)
  if (!policy) return null
  const ctx = context ?? await policyContext()
  const selected = selectSections(allSections, id, ctx)
  const revised = selected.sections.map(s => s.revised).filter((d): d is string => !!d).sort().pop() ?? null
  return { policy, ...selected, context: ctx, revised }
}

/** The policy as plain Markdown with every value filled in: what a version records. */
export function policyText(resolved: ResolvedPolicy): string {
  return renderPolicy(resolved.policy.title, resolved.sections, resolved.context)
}

/** The address of a section in the `policies` content collection. */
export const sectionPath = (s: Pick<PolicySection, 'module' | 'policy' | 'id'>) => `/${s.module}/${s.policy}/${s.id}`
