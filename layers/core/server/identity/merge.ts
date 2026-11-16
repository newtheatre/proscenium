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
  'core_account_merges.survivor_id': 'none',
  'core_account_merges.merged_account_id': 'none',
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

export async function mergePreview(survivorId: string, mergedAccountId: string) {
  const counts: { table: string, column: string, action: string, rows: number }[] = []
  for (const step of mergePlan()) {
    if (step.action === 'none' || step.action === 'alias') continue
    const [row] = await all<{ n: number }>(`SELECT count(*) AS n FROM "${step.table}" WHERE "${step.column}" = ?`, mergedAccountId)
    if (row?.n) counts.push({ ...step, rows: row.n })
  }
  return { survivor: await accountById(survivorId), mergedAccount: await accountById(mergedAccountId), moves: counts }
}

/**
 * Merges `mergedAccountId` into `survivorId`. Refuses a merge with itself, with a tombstone or with an account
 * already merged away, and (ID-29) one that would leave no Owner who can sign in.
 */
export async function mergeAccounts(unit: UnitView, actor: Actor, input: { survivorId: string, mergedAccountId: string, startedBy?: 'person' | 'staff' | 'claim' }): Promise<string> {
  const { survivorId, mergedAccountId } = input
  if (survivorId === mergedAccountId) refuse('core.merge.same', 'An account cannot be merged with itself.', { status: 422 })
  const survivor = await accountById(survivorId)
  const mergedAccount = await accountById(mergedAccountId)
  if (!survivor || !mergedAccount) refuse('core.not-found', 'There is no such person.', { status: 404 })
  for (const account of [survivor, mergedAccount]) {
    if (account.anonymised_at) refuse('core.merge.erased', 'An erased account cannot be merged.', { status: 409 })
    if (account.merged_into_id) refuse('core.merge.already-merged', 'This account has already been merged into another.', { status: 409, remedy: 'Merge with the account it went into instead.' })
  }
  const plan = mergePlan()
  const at = nowMs()
  const undo = await useSetting('core.merge.undo-window') as number
  const mergeId = newId('mrg')
  unit.add({
    sql: 'INSERT INTO core_account_merges (id, survivor_id, merged_account_id, started_by, performed_by, performed_at, undo_until) VALUES (?, ?, ?, ?, ?, ?, ?)',
    params: [mergeId, survivorId, mergedAccountId, input.startedBy ?? 'staff', actor.accountId ?? null, at, at + undo * 1000], // not-policy: seconds to milliseconds
  })
  for (const step of plan) {
    const t = `"${step.table}"`
    const c = `"${step.column}"`
    if (step.action === 'move') {
      unit.add({ sql: `INSERT INTO core_account_merge_items (merge_id, table_name, column_name, row_id, action) SELECT ?, ?, ?, rowid, 'moved' FROM ${t} WHERE ${c} = ?`, params: [mergeId, step.table, step.column, mergedAccountId] })
      unit.add({ sql: `UPDATE ${t} SET ${c} = ? WHERE ${c} = ?`, params: [survivorId, mergedAccountId] })
    }
    else if (step.action === 'delete') {
      unit.add({ sql: `DELETE FROM ${t} WHERE ${c} = ?`, params: [mergedAccountId] })
    }
    else if (step.action === 'end-sessions') {
      endSessionsOf(unit, mergedAccountId, 'merged')
    }
  }
  // Grants are history and never rewritten: the old account's live grants end, and the survivor
  // gets the same role, scope and end date, unless it already holds it.
  const grants = await all<{ id: string, role_id: string, scope: string, scope_module: string | null, scope_type: string | null, scope_id: string | null, expires_at: number | null }>(`SELECT g.* FROM core_grants g WHERE g.account_id = ? AND ${LIVE}`, mergedAccountId, at, at)
  for (const g of grants) {
    unit.add({ sql: 'INSERT INTO core_grant_ends (grant_id, ended_at, ended_by, ended_reason) VALUES (?, ?, ?, \'merged\')', params: [g.id, at, actor.accountId ?? null] })
    unit.add({ sql: 'INSERT INTO core_account_merge_items (merge_id, table_name, column_name, row_id, action) VALUES (?, \'core_grants\', \'account_id\', ?, \'ended\')', params: [mergeId, g.id] })
    const id = newId('gra')
    unit.add({
      sql: `INSERT INTO core_grants (id, account_id, role_id, scope, scope_module, scope_type, scope_id, starts_at, expires_at, granted_by, granted_at)
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
             WHERE NOT EXISTS (SELECT 1 FROM core_grants g WHERE g.account_id = ? AND g.role_id = ? AND g.scope = ? AND g.scope_module IS ? AND g.scope_type IS ? AND g.scope_id IS ? AND ${LIVE})`,
      params: [id, survivorId, g.role_id, g.scope, g.scope_module, g.scope_type, g.scope_id, at, g.expires_at, actor.accountId ?? null, at, survivorId, g.role_id, g.scope, g.scope_module, g.scope_type, g.scope_id, at, at],
    })
  }
  // The survivor keeps its own details, taking the old account's only where it has none.
  unit.add({
    sql: 'UPDATE core_accounts SET name = coalesce(name, (SELECT name FROM core_accounts WHERE id = ?)), preferred_name = coalesce(preferred_name, (SELECT preferred_name FROM core_accounts WHERE id = ?)), pronouns = coalesce(pronouns, (SELECT pronouns FROM core_accounts WHERE id = ?)), phone = coalesce(phone, (SELECT phone FROM core_accounts WHERE id = ?)), first_signed_in_at = coalesce(first_signed_in_at, (SELECT first_signed_in_at FROM core_accounts WHERE id = ?)) WHERE id = ? AND merged_into_id IS NULL',
    params: [mergedAccountId, mergedAccountId, mergedAccountId, mergedAccountId, mergedAccountId, survivorId],
  }).expect(1, { code: 'core.merge.already-merged', reason: 'One of these accounts was merged a moment ago.', remedy: 'Reload and try again.' })
  unit.add({ sql: 'UPDATE core_accounts SET merged_into_id = ?, merged_at = ? WHERE id = ? AND merged_into_id IS NULL AND anonymised_at IS NULL', params: [survivorId, at, mergedAccountId] })
    .expect(1, { code: 'core.merge.already-merged', reason: 'One of these accounts was merged a moment ago.', remedy: 'Reload and try again.' })
  if ((await isOwner(mergedAccountId)) || (await isOwner(survivorId))) guardLastOwner(unit)
  unit.announce('core.account.merged', { survivorId, mergedAccountId, mergeId }, { record: ['core.account', survivorId] })
  unit.audit({ action: 'state', ...(input.startedBy === 'claim' ? {} : { ability: 'core.account.merge' }), record: ['core.account', survivorId], detail: { mergedAccountId, mergeId, grantsMoved: grants.length, startedBy: input.startedBy ?? 'staff' } })
  return mergeId
}
