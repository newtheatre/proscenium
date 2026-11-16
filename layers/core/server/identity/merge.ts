// Merging two accounts (ID-32). One batch: every column that refers to an account is handled by
// the rule it declared. `move` columns are rewritten to the survivor and listed, so a merge can be
// undone; `alias` columns keep the old id, which canonicalAccount follows to the survivor; the
// `handler` columns are identity's own, handled here. Addresses, passkeys and grants move, and the
// old account's sessions end.
import { all, newId, nowMs, refuse, useSetting, type Actor, type UnitView } from '#kit'
import { useRegistry } from '#kit/registry'
import { accountById } from './accounts'
import { LIVE, guardLastOwner, isOwner } from './grants'
import { endSessionsOf } from './sessions'

/** What a merge does to one account column. */
export interface MergeStep { table: string, column: string, action: 'move' | 'alias' | 'delete' | 'end-sessions' | 'reissue-grants' | 'none' }

/** identity's own `handler` columns, and what a merge does to each. */
const HANDLERS: Record<string, MergeStep['action']> = {
  'core_recovery_codes.account_id': 'delete',
  'core_account_tokens.account_id': 'delete',
  'core_passkey_challenges.account_id': 'delete',
  'core_sessions.account_id': 'end-sessions',
}

/** Columns a merge must leave alone because they record the merge or the grant history itself. */
const SPECIAL: Record<string, MergeStep['action']> = {
  'core_grants.account_id': 'reissue-grants',
  'core_account_merges.winner_id': 'none',
  'core_account_merges.loser_id': 'none',
}

/**
 * The plan for every account column in the registry. A `handler` column no handler covers is a
 * declaration problem, reported before anything is written.
 */
export function mergePlan(): MergeStep[] {
  const steps: MergeStep[] = []
  for (const [name, { meta }] of useRegistry().tables as Map<string, { meta: { columns: Record<string, { sql: string, meta: { account?: { onMerge: string } } }> } }>) {
    for (const { sql, meta: column } of Object.values(meta.columns)) {
      if (!column.account) continue
      const key = `${name}.${sql}`
      if (SPECIAL[key]) steps.push({ table: name, column: sql, action: SPECIAL[key] })
      else if (column.account.onMerge === 'move') steps.push({ table: name, column: sql, action: 'move' })
      else if (column.account.onMerge === 'alias') steps.push({ table: name, column: sql, action: 'alias' })
      else if (HANDLERS[key]) steps.push({ table: name, column: sql, action: HANDLERS[key] })
      else throw new Error(`${key} declares onMerge: 'handler' but no merge handler covers it`)
    }
  }
  return steps
}

export async function mergePreview(winnerId: string, loserId: string) {
  const counts: { table: string, column: string, action: string, rows: number }[] = []
  for (const step of mergePlan()) {
    if (step.action === 'none' || step.action === 'alias') continue
    const [row] = await all<{ n: number }>(`SELECT count(*) AS n FROM "${step.table}" WHERE "${step.column}" = ?`, loserId)
    if (row?.n) counts.push({ ...step, rows: row.n })
  }
  return { winner: await accountById(winnerId), loser: await accountById(loserId), moves: counts }
}

/**
 * Merges `loserId` into `winnerId`. Refuses a merge with itself, with a tombstone or with an account
 * already merged away, and (ID-29) one that would leave no Owner who can sign in.
 */
export async function mergeAccounts(unit: UnitView, actor: Actor, input: { winnerId: string, loserId: string }): Promise<string> {
  const { winnerId, loserId } = input
  if (winnerId === loserId) refuse('core.merge.same', 'An account cannot be merged with itself.', { status: 422 })
  const winner = await accountById(winnerId)
  const loser = await accountById(loserId)
  if (!winner || !loser) refuse('core.not-found', 'There is no such person.', { status: 404 })
  for (const account of [winner, loser]) {
    if (account.anonymised_at) refuse('core.merge.erased', 'An erased account cannot be merged.', { status: 409 })
    if (account.merged_into_id) refuse('core.merge.already-merged', 'This account has already been merged into another.', { status: 409, remedy: 'Merge with the account it went into instead.' })
  }
  const plan = mergePlan()
  const at = nowMs()
  const undo = await useSetting('core.merge.undo-window') as number
  const mergeId = newId('mrg')
  unit.add({
    sql: 'INSERT INTO core_account_merges (id, winner_id, loser_id, started_by, performed_by, performed_at, undo_until) VALUES (?, ?, ?, \'staff\', ?, ?, ?)',
    params: [mergeId, winnerId, loserId, actor.accountId ?? null, at, at + undo * 1000], // not-policy: seconds to milliseconds
  })
  for (const step of plan) {
    const t = `"${step.table}"`
    const c = `"${step.column}"`
    if (step.action === 'move') {
      unit.add({ sql: `INSERT INTO core_account_merge_items (merge_id, table_name, column_name, row_id, action) SELECT ?, ?, ?, rowid, 'moved' FROM ${t} WHERE ${c} = ?`, params: [mergeId, step.table, step.column, loserId] })
      unit.add({ sql: `UPDATE ${t} SET ${c} = ? WHERE ${c} = ?`, params: [winnerId, loserId] })
    }
    else if (step.action === 'delete') {
      unit.add({ sql: `DELETE FROM ${t} WHERE ${c} = ?`, params: [loserId] })
    }
    else if (step.action === 'end-sessions') {
      endSessionsOf(unit, loserId, 'merged')
    }
  }
  // Grants are history and never rewritten: the old account's live grants end, and the survivor
  // gets the same role, scope and end date, unless it already holds it.
  const grants = await all<{ id: string, role_id: string, scope: string, scope_module: string | null, scope_type: string | null, scope_id: string | null, expires_at: number | null }>(`SELECT g.* FROM core_grants g WHERE g.account_id = ? AND ${LIVE}`, loserId, at, at)
  for (const g of grants) {
    unit.add({ sql: 'INSERT INTO core_grant_ends (grant_id, ended_at, ended_by, ended_reason) VALUES (?, ?, ?, \'merged\')', params: [g.id, at, actor.accountId ?? null] })
    unit.add({ sql: 'INSERT INTO core_account_merge_items (merge_id, table_name, column_name, row_id, action) VALUES (?, \'core_grants\', \'account_id\', ?, \'ended\')', params: [mergeId, g.id] })
    const id = newId('gra')
    unit.add({
      sql: `INSERT INTO core_grants (id, account_id, role_id, scope, scope_module, scope_type, scope_id, starts_at, expires_at, granted_by, granted_at)
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
             WHERE NOT EXISTS (SELECT 1 FROM core_grants g WHERE g.account_id = ? AND g.role_id = ? AND g.scope = ? AND g.scope_module IS ? AND g.scope_type IS ? AND g.scope_id IS ? AND ${LIVE})`,
      params: [id, winnerId, g.role_id, g.scope, g.scope_module, g.scope_type, g.scope_id, at, g.expires_at, actor.accountId ?? null, at, winnerId, g.role_id, g.scope, g.scope_module, g.scope_type, g.scope_id, at, at],
    })
  }
  // The survivor keeps its own details, taking the old account's only where it has none.
  unit.add({
    sql: 'UPDATE core_accounts SET name = coalesce(name, (SELECT name FROM core_accounts WHERE id = ?)), preferred_name = coalesce(preferred_name, (SELECT preferred_name FROM core_accounts WHERE id = ?)), pronouns = coalesce(pronouns, (SELECT pronouns FROM core_accounts WHERE id = ?)), phone = coalesce(phone, (SELECT phone FROM core_accounts WHERE id = ?)), first_signed_in_at = coalesce(first_signed_in_at, (SELECT first_signed_in_at FROM core_accounts WHERE id = ?)) WHERE id = ? AND merged_into_id IS NULL',
    params: [loserId, loserId, loserId, loserId, loserId, winnerId],
  }).expect(1, { code: 'core.merge.already-merged', reason: 'One of these accounts was merged a moment ago.', remedy: 'Reload and try again.' })
  unit.add({ sql: 'UPDATE core_accounts SET merged_into_id = ?, merged_at = ? WHERE id = ? AND merged_into_id IS NULL AND anonymised_at IS NULL', params: [winnerId, at, loserId] })
    .expect(1, { code: 'core.merge.already-merged', reason: 'One of these accounts was merged a moment ago.', remedy: 'Reload and try again.' })
  if ((await isOwner(loserId)) || (await isOwner(winnerId))) guardLastOwner(unit)
  unit.announce('core.account.merged', { winnerId, loserId, mergeId }, { record: ['core.account', winnerId] })
  unit.audit({ action: 'state', ability: 'core.account.merge', record: ['core.account', winnerId], detail: { loserId, mergeId, grantsMoved: grants.length } })
  return mergeId
}
