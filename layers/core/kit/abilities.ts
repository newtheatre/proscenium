// Abilities, record types and facts (Abilities registry tab). Roles, grants and the permission
// screens belong to identity; this is the format they read.
import { DeclarationError } from './refusal'

export interface RecordDecl { table: string, parent?: string, owner?: string }
export interface AbilityDecl {
  /** The record type it acts on. Without it the ability is site-wide only. */
  on?: string
  risk?: 'normal' | 'privileged'
  owner?: 'ignored' | 'grants' | 'refuses'
  /** Other abilities of the same module, by short name, that come with this one. */
  implies?: string[]
  /** true: using it writes an audit entry. 'read': reads under it are audited too. */
  audit?: boolean | 'read'
  assurance?: 'basic' | 'strong'
  /** Within how long the person must have re-asserted who they are: a duration, or true for the site's default. */
  fresh?: string | boolean
  grantAt?: ('site' | 'module' | 'record')[]
}
export interface FactDecl { on?: string, standing?: boolean }

const KEBAB = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*'

export const record = (d: RecordDecl): RecordDecl => d

export function ability(d: AbilityDecl = {}): Required<Pick<AbilityDecl, 'risk' | 'owner' | 'audit' | 'assurance' | 'fresh'>> & AbilityDecl {
  const privileged = d.risk === 'privileged'
  return {
    ...d,
    risk: d.risk ?? 'normal',
    owner: d.owner ?? 'ignored',
    audit: d.audit ?? true,
    assurance: d.assurance ?? (privileged ? 'strong' : 'basic'),
    fresh: d.fresh ?? privileged,
  }
}

export const fact = (d: FactDecl = {}): FactDecl => d

function prefixed<M extends string, T>(module: M, kind: string, pattern: RegExp, entries: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [short, value] of Object.entries(entries)) {
    if (!pattern.test(short)) throw new DeclarationError(`${kind}.${short}`, `breaks the naming rule for ${kind}`)
    out[`${module}.${short}`] = value
  }
  return out
}

/** Record types: `<module>.<noun>`, singular. */
export function defineRecords<const M extends string, const R extends Record<string, RecordDecl>>(module: M, records: R): { [K in keyof R & string as `${M}.${K}`]: R[K] } {
  return prefixed(module, 'records', new RegExp(`^${KEBAB}$`), records) as any
}

/** Abilities: `<module>.<record>.<verb>`. */
export function defineAbilities<const M extends string, const A extends Record<string, AbilityDecl>>(module: M, abilities: A): { [K in keyof A & string as `${M}.${K}`]: A[K] } {
  const out = prefixed(module, 'abilities', new RegExp(`^${KEBAB}\\.${KEBAB}$`), abilities)
  for (const [key, decl] of Object.entries(out)) {
    for (const implied of decl.implies ?? []) {
      if (!(implied in abilities)) throw new DeclarationError(`abilities.${key}.implies`, `"${implied}" is not an ability of ${module}`)
    }
    // A privileged ability may skip freshness only when it reads and its reads are audited; one that
    // changes anything always needs a fresh sign-in.
    if (decl.risk === 'privileged' && decl.fresh === false && decl.audit !== 'read') throw new DeclarationError(`abilities.${key}.fresh`, "a privileged ability needs a fresh sign-in, unless it only reads and says audit: 'read'")
  }
  return out as any
}

/** Facts: `<module>.<name>`, authority that follows from a record. Resolver: server/facts/<name>.ts. */
export function defineFacts<const M extends string, const F extends Record<string, FactDecl>>(module: M, facts: F): { [K in keyof F & string as `${M}.${K}`]: F[K] } {
  return prefixed(module, 'facts', new RegExp(`^${KEBAB}$`), facts) as any
}
