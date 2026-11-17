// Roles and grants as the permission check reads them (part 3, "The grant"). A grant is live from
// its start until its expiry or its row in core_grant_ends, whichever is first. Grants on an
// unclaimed or unusable account count for nothing, because such an account is never an actor.
import { all, first, nowMs, useContext, type Grant, type UnitView } from '#kit'
import { useRegistry } from '#kit/registry'
import { impliedAbility } from '#kit/abilities'

export const OWNER = 'owner'

export interface LiveGrant {
  id: string
  account_id: string
  role_id: string
  role_key: string
  scope: 'site' | 'module' | 'record'
  scope_module: string | null
  scope_type: string | null
  scope_id: string | null
  expires_at: number | null
}

/**
 * SQL for the account that holds grant `g` now: the account it was given to, or the survivor that
 * account was merged into. A merge leaves grants where they are (core_grants is append-only, so its
 * account column is an alias); every read of who holds a grant goes through this.
 */
export const HOLDER = 'coalesce((SELECT h.merged_into_id FROM core_accounts h WHERE h.id = g.account_id), g.account_id)'

/** SQL for "grant `g` is held by the person behind the account in the one `?`", whichever of their ids it is. */
export const HELD_BY = `${HOLDER} = (SELECT coalesce(s.merged_into_id, s.id) FROM core_accounts s WHERE s.id = ?)`

/** SQL for "this grant is live now"; `g` is core_grants. Takes the time twice. */
export const LIVE = 'g.starts_at <= ? AND (g.expires_at IS NULL OR g.expires_at > ?) AND NOT EXISTS (SELECT 1 FROM core_grant_ends e WHERE e.grant_id = g.id)'

export async function liveGrantsOf(accountId: string): Promise<LiveGrant[]> {
  const at = nowMs()
  return all<LiveGrant>(
    `SELECT g.id, g.account_id, g.role_id, r.key AS role_key, g.scope, g.scope_module, g.scope_type, g.scope_id, g.expires_at
       FROM core_grants g JOIN core_roles r ON r.id = g.role_id
      WHERE ${HELD_BY} AND r.archived_at IS NULL AND ${LIVE}
      ORDER BY g.granted_at`,
    accountId, at, at,
  )
}

export async function ownerRoleId(): Promise<string | null> {
  return (await first<{ id: string }>('SELECT id FROM core_roles WHERE key = ?', OWNER))?.id ?? null
}

/**
 * Reads of information about other people that an Owner does not hold by being an Owner (part 3,
 * "Emergency contacts"): only somebody given them, such as the welfare lead, reads them. An Owner
 * can still give them, because an Owner may give any role.
 */
export const OWNER_DOES_NOT_READ: ReadonlySet<string> = new Set(['core.emergency-contact.read'])

/** Every ability a role brings, with what each implies. Owner brings every declared ability but those above. */
export async function roleAbilities(roleId: string, roleKey?: string): Promise<string[]> {
  if (roleKey === OWNER) return [...useRegistry().abilities.keys()].filter(a => !OWNER_DOES_NOT_READ.has(a))
  const rows = await all<{ ability: string }>('SELECT ability FROM core_role_abilities WHERE role_id = ?', roleId)
  return withImplied(rows.map(r => r.ability))
}

/** An ability list closed under `implies`, keeping only declared abilities. */
export function withImplied(abilities: Iterable<string>): string[] {
  const registry = useRegistry()
  const out = new Set<string>()
  const queue = [...abilities]
  while (queue.length) {
    const name = queue.pop()!
    if (out.has(name)) continue
    const declared = registry.abilities.get(name)
    if (!declared) continue
    out.add(name)
    for (const entry of declared.decl.implies ?? []) queue.push(impliedAbility(declared.module, entry))
  }
  return [...out].sort()
}

/**
 * The kit's grants for an account: one per ability its live grants bring, carrying the grant's
 * scope. A grant at module scope brings only that module's abilities.
 */
export async function kitGrantsOf(accountId: string): Promise<Grant[]> {
  const context = useContext()
  const key = `identityGrants:${accountId}`
  if (context.cache[key]) return context.cache[key] as Grant[]
  const registry = useRegistry()
  const out: Grant[] = []
  for (const grant of await liveGrantsOf(accountId)) {
    const via = `grant:${grant.id}`
    const carried: string[] = []
    for (const ability of await roleAbilities(grant.role_id, grant.role_key)) {
      const declared = registry.abilities.get(ability)!
      if (grant.scope === 'site') out.push({ ability, via })
      else if (grant.scope === 'module') {
        if (declared.module === grant.scope_module && (declared.decl.grantAt ?? ['site', 'module', 'record']).includes('module')) {
          out.push({ ability, via })
          carried.push(ability)
        }
      }
      else if (declared.module === grant.scope_module) {
        out.push({ ability, via, record: { type: grant.scope_type!, id: grant.scope_id! } })
        carried.push(ability)
      }
    }
    // A scoped grant still brings the impliable abilities its abilities imply, with no record.
    for (const ability of withImplied(carried)) {
      if (registry.abilities.get(ability)!.decl.impliable && !out.some(g => g.ability === ability && !g.record)) out.push({ ability, via })
    }
  }
  context.cache[key] = out
  return out
}

/** The theatre's mapping of facts to abilities. A privileged ability counts only once confirmed. */
export async function factAbilityMap(): Promise<Record<string, string[]>> {
  const context = useContext()
  if (context.cache.identityFacts) return context.cache.identityFacts as Record<string, string[]>
  const registry = useRegistry()
  const rows = await all<{ fact: string, ability: string, confirmed_privileged_at: number | null }>('SELECT fact, ability, confirmed_privileged_at FROM core_fact_abilities WHERE pinned_record = \'\'')
  const map: Record<string, string[]> = {}
  for (const row of rows) {
    const declared = registry.abilities.get(row.ability)
    if (!declared || !registry.facts.has(row.fact)) continue
    if (declared.decl.risk === 'privileged' && !row.confirmed_privileged_at) continue
    ;(map[row.fact] ??= []).push(row.ability)
  }
  context.cache.identityFacts = map
  return map
}

/**
 * SQL that is true while at least one Owner can still sign in strongly: a live Owner grant on a
 * claimed, usable account that holds a passkey. Takes the time twice.
 */
export const USABLE_OWNER_EXISTS = `EXISTS (
  SELECT 1 FROM core_grants g
    JOIN core_roles r ON r.id = g.role_id AND r.key = '${OWNER}'
    JOIN core_accounts a ON a.id = ${HOLDER}
   WHERE ${LIVE}
     AND a.first_signed_in_at IS NOT NULL AND a.disabled_at IS NULL AND a.merged_into_id IS NULL AND a.anonymised_at IS NULL
     AND EXISTS (SELECT 1 FROM core_passkeys p WHERE p.account_id = a.id))`

/**
 * Adds the "always an Owner" check to a unit, after the statements that might remove the last one
 * (ID-29). It is part of the batch, so two Owners removing each other at once cannot both succeed:
 * D1 runs batches one after another, and the second sees the first's change.
 */
export function guardLastOwner(unit: UnitView): void {
  const at = nowMs()
  unit.add({ sql: `UPDATE core_roles SET key = key WHERE key = '${OWNER}' AND ${USABLE_OWNER_EXISTS}`, params: [at, at] })
    .expect(1, { code: 'core.owner.last', reason: 'This would leave the theatre with no Owner who can sign in.', remedy: 'Make someone else an Owner first, and make sure they have a passkey.' })
}

export async function isOwner(accountId: string): Promise<boolean> {
  return (await liveGrantsOf(accountId)).some(g => g.role_key === OWNER)
}
