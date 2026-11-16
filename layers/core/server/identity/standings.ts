// Standings (part 3, "The members' side"; part 6, "Facts"): what puts a person on the members'
// side. A standing is a live grant of a role marked as opening the members' area, or any fact a
// module marks `standing: true` that holds for the person now. Nothing here is stored: each answer
// is read when it is asked, so it can never fall out of step with what it sums.
import { all, fact, factHolders, isEnabled, nowMs, useContext, useSetting, type Actor } from '#kit'
import { useRegistry } from '#kit/registry'
import { LIVE } from './grants'

export interface Standing {
  /** `role:<key>` for a role, or the fact's name. */
  source: string
  /** The role's name, for a role. */
  label?: string
}

/** The facts other modules declare as standings, of modules that are switched on. */
async function standingFacts(): Promise<string[]> {
  const out: string[] = []
  for (const [name, { module, decl }] of useRegistry().facts) {
    if (decl.standing && (await isEnabled(module))) out.push(name)
  }
  return out
}

const USABLE = 'a.first_signed_in_at IS NOT NULL AND a.disabled_at IS NULL AND a.merged_into_id IS NULL AND a.anonymised_at IS NULL'

async function roleStandings(accountId: string): Promise<Standing[]> {
  const at = nowMs()
  const rows = await all<{ key: string, name: string }>(
    `SELECT DISTINCT r.key, r.name FROM core_grants g
       JOIN core_roles r ON r.id = g.role_id AND r.opens_members_area = 1 AND r.archived_at IS NULL
       JOIN core_accounts a ON a.id = g.account_id
      WHERE g.account_id = ? AND ${USABLE} AND ${LIVE}
      ORDER BY r.name`,
    accountId, at, at,
  )
  return rows.map(r => ({ source: `role:${r.key}`, label: r.name }))
}

const personFor = (accountId: string): Actor => ({ kind: 'person', accountId })

/** Every standing an account holds now, each naming its source. Empty for an unclaimed or unusable account. */
export async function standingOf(accountId: string): Promise<Standing[]> {
  const out = await roleStandings(accountId)
  const actor = personFor(accountId)
  for (const name of await standingFacts()) if (await fact(name, actor)) out.push({ source: name })
  return out
}

/**
 * Whether an actor holds any standing now: the answer of the fact core.member. A role is checked
 * first, because it is one query; facts are asked only if no role gives one. Cached for the request.
 */
export async function hasStanding(actor: Actor): Promise<boolean> {
  if (!actor.accountId) return false
  const context = useContext()
  const key = `identityStanding:${actor.accountId}`
  if (key in context.cache) return context.cache[key] as boolean
  let holds = (await roleStandings(actor.accountId)).length > 0
  if (!holds) {
    for (const name of await standingFacts()) {
      if (await fact(name, actor)) {
        holds = true
        break
      }
    }
  }
  context.cache[key] = holds
  return holds
}

/**
 * Everybody who holds a standing now. A standing fact whose module declared no `holders` cannot be
 * listed; its holders are missing from this answer, and the caller is told by `complete: false`.
 */
export async function standingHolders(): Promise<{ accountIds: string[], complete: boolean }> {
  const at = nowMs()
  const rows = await all<{ account_id: string }>(
    `SELECT DISTINCT g.account_id FROM core_grants g
       JOIN core_roles r ON r.id = g.role_id AND r.opens_members_area = 1 AND r.archived_at IS NULL
       JOIN core_accounts a ON a.id = g.account_id
      WHERE ${USABLE} AND ${LIVE}`,
    at, at,
  )
  const ids = new Set(rows.map(r => r.account_id))
  let complete = true
  for (const name of await standingFacts()) {
    const holders = await factHolders(name)
    if (holders === null) complete = false
    else for (const id of holders) ids.add(id)
  }
  return { accountIds: [...ids].sort(), complete }
}

/**
 * Whether the members' side is open to this actor now (ID-19 to ID-21): signed in, holding
 * core.member, and the theatre has the members' area switched on. Asked on every request, so the
 * area opens with no sign-out when a standing begins and closes quietly when the last one ends.
 */
export async function isMember(actor: Actor): Promise<boolean> {
  if (actor.kind !== 'person' || !actor.accountId) return false
  if (!(await useSetting('core.members-area.enabled'))) return false
  return fact('core.member', actor)
}
