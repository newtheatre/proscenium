// The one permission check (R1). Grants, roles, facts and ownership only ever allow; the single
// declarative refusal is owner: 'refuses'. Where grants come from is identity's business: it
// installs an access provider. Until then the provider reads grants from the actor itself.
import { useRegistry } from './registry'
import { impliedAbility } from './abilities'
import { isEnabled } from './modules-store'
import { useSetting } from './settings-store'
import { nowMs } from './clock'
import { first } from './database'
import { parseDuration } from './duration'
import { Refusal } from './refusal'
import type { Actor, Grant } from './context'
import type { AbilityName } from './registry-types'
import type { H3Event } from 'h3'

export interface AccessProvider {
  /** Who is making this request. */
  actor: (event: H3Event) => Promise<Actor>
  /** Every grant the actor holds, through roles or directly. */
  grants?: (actor: Actor) => Promise<Grant[]>
  /** The theatre's mapping of facts to abilities. A privileged ability appears only once confirmed. */
  factAbilities?: () => Promise<Record<string, string[]>>
}

const defaultProvider: AccessProvider = {
  actor: async () => ({ kind: 'anonymous' }),
  grants: async actor => actor.grants ?? [],
  factAbilities: async () => ({}),
}
let provider: AccessProvider = defaultProvider

/** Identity installs its provider here; a test installs one that reads its actor from a header. */
export function setAccessProvider(next: AccessProvider | undefined): void {
  provider = next ? { ...defaultProvider, ...next } : defaultProvider
}

export function useAccessProvider(): AccessProvider {
  return provider
}

export type Decision
  = | { allowed: true, by: string }
    | { allowed: false, code: string, reason: string, remedy?: string, status: number }

type Ref = { type: string, id: string }

/** Every ability that brings this one with it, through `implies`, including itself. */
function grantingAbilities(ability: string): Set<string> {
  const registry = useRegistry()
  const out = new Set([ability])
  let grew = true
  while (grew) {
    grew = false
    for (const [name, { module, decl }] of registry.abilities) {
      if (out.has(name)) continue
      if ((decl.implies ?? []).some(entry => out.has(impliedAbility(module, entry)))) {
        out.add(name)
        grew = true
      }
    }
  }
  return out
}

/** The record and its ancestors, nearest first, through the parent each record type's resolver gives. */
async function lineage(record: Ref): Promise<Ref[]> {
  const chain: Ref[] = [record]
  const { usePoint } = await import('./points')
  let current: Ref | undefined = record
  for (let depth = 0; current && depth < 8; depth++) { // not-policy: record trees are shallow
    const resolvers = await usePoint('core.record-resolver')
    const resolver = resolvers.find(r => r.id === current!.type)?.value as { resolve?: (id: string) => Promise<{ parent?: Ref } | null> } | undefined
    const parent: Ref | undefined = resolver?.resolve ? (await resolver.resolve(current.id))?.parent : undefined
    if (!parent) break
    chain.push(parent)
    current = parent
  }
  return chain
}

async function ownerOf(record: Ref): Promise<string | null> {
  const registry = useRegistry()
  const decl = registry.records.get(record.type)?.decl
  if (!decl?.owner) return null
  const row = await first<{ owner: string | null }>(`SELECT "${decl.owner}" AS owner FROM "${decl.table}" WHERE id = ?`, record.id)
  return row?.owner ?? null
}

const refuse = (code: string, reason: string, status: number, remedy?: string): Decision => ({ allowed: false, code, reason, status, remedy })

/**
 * May this actor use this ability, on this record if one is given? Returns what allowed it, for
 * the audit row, or the refusal to show. 'signed-in' means any signed-in person.
 */
export async function can(actor: Actor, ability: AbilityName | 'signed-in', recordIn?: Ref | readonly [string, string]): Promise<Decision> {
  const record = Array.isArray(recordIn) ? { type: recordIn[0], id: recordIn[1] } : recordIn as Ref | undefined
  const signedIn = actor.kind === 'person' || actor.kind === 'setup'
  if (actor.kind === 'system' || actor.kind === 'job') return { allowed: true, by: actor.kind }
  if (!signedIn) return refuse('core.access.signed-out', 'You need to sign in to do this.', 401, 'Sign in, then try again.')
  if (ability === 'signed-in') return { allowed: true, by: 'signed-in' }

  const registry = useRegistry()
  const declared = registry.abilities.get(ability)
  if (!declared) throw new Error(`"${ability}" is not a declared ability`)
  const { decl, module } = declared
  if (!(await isEnabled(module))) return refuse('core.module.off', `${module} is switched off.`, 404)

  const owner = record && decl.owner && decl.owner !== 'ignored' ? await ownerOf(record) : null
  const isOwner = !!owner && owner === actor.accountId
  if (decl.owner === 'refuses' && isOwner) return refuse('core.access.own-record', 'You cannot do this to your own record.', 403, 'Ask someone else who has this permission.')

  let by: string | undefined
  if (decl.owner === 'grants' && isOwner) by = 'owner'

  const granting = grantingAbilities(ability)
  const levels = decl.grantAt ?? ['site', 'module', 'record']
  // An impliable ability comes with any ability that implies it, at whatever reach that one is held,
  // with no record: the grant or fact of the implying ability is what allowed it.
  const implying = new Set<string>()
  if (decl.impliable) {
    for (const name of granting) if (name !== ability && (await isEnabled(registry.abilities.get(name)!.module))) implying.add(name)
  }
  if (!by) {
    const grants = await provider.grants!(actor)
    const chain = record ? await lineage(record) : []
    for (const grant of grants) {
      if (grant.ability ? implying.has(grant.ability) : [...implying].some(name => registry.abilities.get(name)!.module === grant.module)) {
        by = grant.via
        break
      }
      const level = grant.record ? 'record' : grant.module ? 'module' : 'site'
      if (!levels.includes(level as any)) continue
      const covers = grant.module ? grant.module === module : !!grant.ability && granting.has(grant.ability)
      if (!covers) continue
      if (grant.record && !chain.some(r => r.type === grant.record!.type && r.id === grant.record!.id)) continue
      by = grant.via
      break
    }
  }
  if (!by) {
    const mapping = await provider.factAbilities!()
    for (const [factName, abilities] of Object.entries(mapping)) {
      if (!abilities.some(a => granting.has(a))) continue
      const fact = registry.facts.get(factName)
      if (!fact || !(await isEnabled(fact.module))) continue
      // Through an implying ability, a fact held on any record will do; it is found from its holders.
      const anyRecord = !record && fact.decl.on && abilities.some(a => implying.has(a))
      if ((await holdsFact(factName, actor, record)) || (anyRecord && actor.accountId && (await factHolders(factName))?.includes(actor.accountId))) {
        by = `fact:${factName}`
        break
      }
    }
  }
  if (!by) return refuse('core.access.denied', 'You do not have permission to do this.', 403, 'Ask an administrator for this permission.')

  if (decl.assurance === 'strong' && actor.assurance !== 'strong') return refuse('core.access.needs-strong-sign-in', 'This needs a stronger sign-in.', 403, 'Sign in with a passkey or a second factor, then try again.')
  if (decl.fresh) {
    const within = typeof decl.fresh === 'string' ? parseDuration(decl.fresh) : await useSetting('core.access.fresh-within')
    if (!actor.reassertedAt || nowMs() - actor.reassertedAt > (within as number) * 1000) // not-policy: seconds to milliseconds
      return refuse('core.access.not-fresh', 'For your safety, confirm it is you before doing this.', 403, 'Confirm your sign-in, then try again.')
  }
  return { allowed: true, by }
}

/** Reads a fact another module declared. A fact of a switched-off module holds for nobody. */
export async function fact(name: string, actor: Actor, record?: Ref | readonly [string, string]): Promise<boolean> {
  const registry = useRegistry()
  const declared = registry.facts.get(name)
  if (!declared) throw new Error(`"${name}" is not a declared fact`)
  if (!(await isEnabled(declared.module))) return false
  const r = Array.isArray(record) ? { type: record[0], id: record[1] } : record as Ref | undefined
  return holdsFact(name, actor, r)
}

/**
 * The account ids that hold a fact now, for one record or for any. Null when the fact's resolver
 * gives no holders, so it cannot be enumerated; empty when its module is switched off.
 */
export async function factHolders(name: string, record?: Ref | readonly [string, string]): Promise<string[] | null> {
  const registry = useRegistry()
  const declared = registry.facts.get(name)
  if (!declared) throw new Error(`"${name}" is not a declared fact`)
  const resolver = registry.modules.get(declared.module)!.handlers.facts?.[name]
  if (!resolver?.holders) return null
  if (!(await isEnabled(declared.module))) return []
  const r = Array.isArray(record) ? { type: record[0], id: record[1] } : record as Ref | undefined
  return resolver.holders(r)
}

async function holdsFact(name: string, actor: Actor, record?: Ref): Promise<boolean> {
  if (actor.facts) return actor.facts.includes(name)
  const declared = useRegistry().facts.get(name)!
  const resolver = useRegistry().modules.get(declared.module)!.handlers.facts?.[name]
  if (!resolver) return false
  const answer = await resolver(actor, record)
  if (typeof answer === 'boolean') return answer
  return answer.holds && (answer.until === undefined || answer.until > nowMs())
}

/** Throws the refusal when the check fails; returns what allowed it when it passes. */
export async function requireAbility(actor: Actor, ability: AbilityName | 'signed-in', record?: Ref | readonly [string, string]): Promise<string> {
  const decision = await can(actor, ability, record)
  if (!decision.allowed) throw new Refusal(decision.code, decision.reason, { status: decision.status, remedy: decision.remedy })
  return decision.by
}
