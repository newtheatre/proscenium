// Who holds something now (part 4, "Three services the core domain asked for"): holdersOf an
// ability, for "tell whoever can approve this", and holdersOfRole, for communications' audiences.
// Both answer canonical account ids, each once, and leave out unclaimed and unusable accounts, so a
// grant waiting for its first sign-in is never a holder.
import { all, can, factHolders, nowMs, type Actor } from '#kit'
import { useRegistry } from '#kit/registry'
import { HOLDER, LIVE, OWNER, OWNER_DOES_NOT_READ, factAbilityMap, withImplied } from './grants'
import type { Scope } from './roles'

const USABLE = 'a.first_signed_in_at IS NOT NULL AND a.disabled_at IS NULL AND a.merged_into_id IS NULL AND a.anonymised_at IS NULL'

type RecordRef = readonly [string, string]

/** Every declared ability that brings this one, itself included. */
function granting(ability: string): string[] {
  return [...useRegistry().abilities.keys()].filter(a => withImplied([a]).includes(ability))
}

async function usable(ids: Iterable<string>): Promise<Set<string>> {
  const list = [...new Set(ids)]
  const out = new Set<string>()
  for (let i = 0; i < list.length; i += 90) { // not-policy: D1's bound-parameter limit
    const chunk = list.slice(i, i + 90) // not-policy: D1's bound-parameter limit
    const rows = await all<{ id: string }>(`SELECT a.id FROM core_accounts a WHERE a.id IN (${chunk.map(() => '?').join(', ')}) AND ${USABLE}`, ...chunk)
    for (const r of rows) out.add(r.id)
  }
  return out
}

/**
 * The accounts that hold an ability now, on a record if one is given, by any route: a granted role
 * at the record's scope or above, a fact the theatre mapped to it, or ownership where the ability's
 * owner rule grants. Each candidate is put through the same check a request would meet, so the
 * answer never disagrees with `can`. A fact whose module declared no `holders` cannot be listed,
 * and its holders are missing from the answer.
 */
export async function holdersOf(ability: string, record?: RecordRef): Promise<string[]> {
  const registry = useRegistry()
  const declared = registry.abilities.get(ability)
  if (!declared) throw new Error(`"${ability}" is not a declared ability`)
  const bringers = granting(ability)
  const at = nowMs()
  const candidates = new Set<string>()

  const ownerBrings = !OWNER_DOES_NOT_READ.has(ability)
  const placeholders = bringers.map(() => '?').join(', ')
  const granted = await all<{ account_id: string }>(
    `SELECT DISTINCT a.id AS account_id FROM core_grants g
       JOIN core_roles r ON r.id = g.role_id AND r.archived_at IS NULL
       JOIN core_accounts a ON a.id = ${HOLDER}
      WHERE ${USABLE} AND ${LIVE}
        AND (${ownerBrings ? `r.key = '${OWNER}' OR ` : ''}EXISTS (SELECT 1 FROM core_role_abilities ra WHERE ra.role_id = r.id AND ra.ability IN (${placeholders})))`,
    at, at, ...bringers,
  )
  for (const row of granted) candidates.add(row.account_id)

  const mapping = await factAbilityMap()
  for (const [fact, abilities] of Object.entries(mapping)) {
    if (!abilities.some(a => bringers.includes(a))) continue
    for (const id of await factHolders(fact, record) ?? []) candidates.add(id)
  }

  if (record && declared.decl.owner === 'grants') {
    const decl = registry.records.get(record[0])?.decl
    if (decl?.owner) {
      const [row] = await all<{ owner: string | null }>(`SELECT "${decl.owner}" AS owner FROM "${decl.table}" WHERE id = ?`, record[1])
      if (row?.owner) candidates.add(row.owner)
    }
  }

  const out: string[] = []
  for (const accountId of await usable(candidates)) {
    // Holding is about grants, not about a session: the person is taken as signed in strongly and
    // just now, so an ability that asks for a fresh sign-in still counts them.
    const actor: Actor = { kind: 'person', accountId, assurance: 'strong', reassertedAt: at }
    if ((await can(actor, ability as never, record)).allowed) out.push(accountId)
  }
  return out.sort()
}

/** The accounts with a live grant of a role now, at one scope if given. */
export async function holdersOfRole(roleId: string, scope?: Scope): Promise<string[]> {
  const at = nowMs()
  const where = scope ? ' AND g.scope = ? AND g.scope_module IS ? AND g.scope_type IS ? AND g.scope_id IS ?' : ''
  const params = scope
    ? [scope.kind, scope.kind === 'site' ? null : scope.module, scope.kind === 'record' ? scope.type : null, scope.kind === 'record' ? scope.id : null]
    : []
  const rows = await all<{ account_id: string }>(
    `SELECT DISTINCT a.id AS account_id FROM core_grants g
       JOIN core_roles r ON r.id = g.role_id AND r.archived_at IS NULL
       JOIN core_accounts a ON a.id = ${HOLDER}
      WHERE g.role_id = ? AND ${USABLE} AND ${LIVE}${where}
      ORDER BY a.id`,
    roleId, at, at, ...params,
  )
  return rows.map(r => r.account_id)
}
