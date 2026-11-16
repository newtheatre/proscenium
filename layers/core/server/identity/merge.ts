// Merging two accounts (ID-32), in two stages (part 4, Merge). Stage one, here, is one unit that
// touches the core's own tables only, so its size never grows with the modules installed: the
// merge is recorded, addresses and sign-in methods move, the old account's sessions end, its grants
// stay where they are and it becomes an alias of the survivor. From that commit every read through the
// account scope finds the whole person. Stage two, the job core.merge-move (merge-move.ts), then
// re-points every other module's `move` columns and runs their merge handlers in the background.
import { accountScopeSql } from '#kit/accounts'
import { all, moveAccountColumn, newId, nowMs, refuse, useSetting, type Actor, type UnitView } from '#kit'
import { accountById } from './accounts'
import { LIVE, guardLastOwner, isOwner } from './grants'
import { SETTLED_IN_STAGE_ONE, accountColumns, moveModules, startMergeMove } from './merge-move'
import { endSessionsOf } from './sessions'

/** What a merge does to one account column. `module-handler` is another module's merge handler, run by stage two. */
export interface MergeStep { module: string, table: string, column: string, action: 'move' | 'move-unless-present' | 'alias' | 'delete' | 'end-sessions' | 'end-duplicate-grants' | 'module-handler' | 'none' }

/** The core's own `handler` columns, and what stage one does to each. */
const HANDLERS: Record<string, MergeStep['action']> = {
  'core_recovery_codes.account_id': 'delete',
  'core_account_tokens.account_id': 'delete',
  'core_passkey_challenges.account_id': 'delete',
  'core_sessions.account_id': 'end-sessions',
  // A notification preference is keyed by account: where both accounts chose, the survivor's choice stands.
  'core_notification_preferences.account_id': 'move-unless-present',
  // The survivor's access application stands; the merged-away one moves only if the survivor has
  // none. Sharing choices move, one row per purpose remaining.
  'core_access_profiles.account_id': 'move-unless-present',
  'core_access_shares.account_id': 'move-unless-present',
}

/** Columns a merge must leave alone because they record the merge or the grant history itself. */
const SPECIAL: Record<string, MergeStep['action']> = {
  'core_grants.account_id': 'end-duplicate-grants',
  'core_account_merges.survivor_id': 'none',
  'core_account_merges.merged_account_id': 'none',
}

/**
 * The plan for every account column in the registry. A `handler` column no handler covers is a
 * declaration problem, reported before anything is written.
 */
export function mergePlan(): MergeStep[] {
  moveModules() // throws for another module's handler column without a merge handler
  const steps: MergeStep[] = []
  for (const { module, table, column, onMerge } of accountColumns()) {
    const key = `${table}.${column}`
    if (SPECIAL[key]) steps.push({ module, table, column, action: SPECIAL[key] })
    else if (onMerge === 'move' || onMerge === 'alias') steps.push({ module, table, column, action: onMerge })
    else if (module !== SETTLED_IN_STAGE_ONE) steps.push({ module, table, column, action: 'module-handler' })
    else if (HANDLERS[key]) steps.push({ module, table, column, action: HANDLERS[key] })
    else throw new Error(`${key} declares onMerge: 'handler' but no merge handler covers it`)
  }
  return steps
}

export async function mergePreview(survivorId: string, mergedAccountId: string) {
  const counts: { table: string, column: string, action: string, rows: number }[] = []
  for (const step of mergePlan()) {
    if (step.action === 'none' || step.action === 'alias' || step.action === 'module-handler') continue
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
  // Stage one: the core's own columns. Every other module's wait for stage two.
  for (const step of plan.filter(s => s.module === SETTLED_IN_STAGE_ONE)) {
    const t = `"${step.table}"`
    const c = `"${step.column}"`
    if (step.action === 'move') {
      moveAccountColumn(unit, { mergeId, table: step.table, column: step.column, survivorId, mergedAccountId })
    }
    else if (step.action === 'move-unless-present') {
      // The row moves unless the survivor already has one with the same key; that one wins.
      unit.add({ sql: `UPDATE OR IGNORE ${t} SET ${c} = ? WHERE ${c} = ?`, params: [survivorId, mergedAccountId] })
      unit.add({ sql: `DELETE FROM ${t} WHERE ${c} = ?`, params: [mergedAccountId] })
    }
    else if (step.action === 'delete') {
      unit.add({ sql: `DELETE FROM ${t} WHERE ${c} = ?`, params: [mergedAccountId] })
    }
    else if (step.action === 'end-sessions') {
      endSessionsOf(unit, mergedAccountId, 'merged')
    }
  }
  // Grants are history and never rewritten: they stay on the account they were given to, which the
  // grant reads resolve to the survivor (HOLDER). Where both accounts hold a live grant of the same
  // role at the same scope, the one that ends sooner ends now as replaced, so one person holds one;
  // a grant with no end outlasts any, and on a tie the merged-away account's goes. The ended grant
  // is listed, so an undo can give it back by writing a new grant.
  const pairs = await all<{ mine: string, mine_role: string, mine_account: string, mine_ends: number | null, theirs: string, theirs_role: string, theirs_account: string, theirs_ends: number | null }>(
    `SELECT a.id AS mine, a.role_id AS mine_role, a.account_id AS mine_account, a.expires_at AS mine_ends,
            b.id AS theirs, b.role_id AS theirs_role, b.account_id AS theirs_account, b.expires_at AS theirs_ends
       FROM core_grants a JOIN core_grants b
         ON b.role_id = a.role_id AND b.scope = a.scope AND b.scope_module IS a.scope_module AND b.scope_type IS a.scope_type AND b.scope_id IS a.scope_id
      WHERE a.account_id IN (${accountScopeSql('?1')}) AND b.account_id IN (${accountScopeSql('?2')})
        AND ${LIVE.replaceAll('?', '?3').replaceAll('g.', 'a.')} AND ${LIVE.replaceAll('?', '?3').replaceAll('g.', 'b.')}`,
    mergedAccountId, survivorId, at,
  )
  const ended = new Map<string, { accountId: string, roleId: string }>()
  for (const p of pairs) {
    if (ended.has(p.mine) || ended.has(p.theirs)) continue
    const mineFirst = (p.mine_ends ?? Infinity) <= (p.theirs_ends ?? Infinity)
    if (mineFirst) ended.set(p.mine, { accountId: p.mine_account, roleId: p.mine_role })
    else ended.set(p.theirs, { accountId: p.theirs_account, roleId: p.theirs_role })
  }
  for (const [grantId, { accountId, roleId }] of ended) {
    unit.add({ sql: 'INSERT INTO core_grant_ends (grant_id, ended_at, ended_by, ended_reason) VALUES (?, ?, ?, \'replaced\')', params: [grantId, at, actor.accountId ?? null] })
    unit.add({ sql: 'INSERT INTO core_account_merge_items (merge_id, table_name, column_name, row_id, action) VALUES (?, \'core_grants\', \'account_id\', ?, \'ended\')', params: [mergeId, grantId] })
    unit.announce('core.grant.ended', { grantId, accountId, roleId, reason: 'replaced' }, { record: ['core.grant', grantId] })
  }
  // The survivor keeps its own details, taking the old account's only where it has none.
  unit.add({
    sql: 'UPDATE core_accounts SET name = coalesce(name, (SELECT name FROM core_accounts WHERE id = ?)), preferred_name = coalesce(preferred_name, (SELECT preferred_name FROM core_accounts WHERE id = ?)), pronouns = coalesce(pronouns, (SELECT pronouns FROM core_accounts WHERE id = ?)), phone = coalesce(phone, (SELECT phone FROM core_accounts WHERE id = ?)), first_signed_in_at = coalesce(first_signed_in_at, (SELECT first_signed_in_at FROM core_accounts WHERE id = ?)) WHERE id = ? AND merged_into_id IS NULL',
    params: [mergedAccountId, mergedAccountId, mergedAccountId, mergedAccountId, mergedAccountId, survivorId],
  }).expect(1, { code: 'core.merge.already-merged', reason: 'One of these accounts was merged a moment ago.', remedy: 'Reload and try again.' })
  // merged_into_id always names the final survivor, which the kit's one-level account scope relies
  // on: accounts already merged into this one now point at the survivor. Listed as merge items, so
  // an undo can put them back. Run before this account's own pointer is set, so it is not caught.
  moveAccountColumn(unit, { mergeId, table: 'core_accounts', column: 'merged_into_id', survivorId, mergedAccountId })
  unit.add({ sql: 'UPDATE core_accounts SET merged_into_id = ?, merged_at = ? WHERE id = ? AND merged_into_id IS NULL AND anonymised_at IS NULL', params: [survivorId, at, mergedAccountId] })
    .expect(1, { code: 'core.merge.already-merged', reason: 'One of these accounts was merged a moment ago.', remedy: 'Reload and try again.' })
  if ((await isOwner(mergedAccountId)) || (await isOwner(survivorId))) guardLastOwner(unit)
  startMergeMove(unit, mergeId)
  unit.announce('core.account.merged', { survivorId, mergedAccountId, mergeId }, { record: ['core.account', survivorId] })
  unit.audit({ action: 'state', ...(input.startedBy === 'claim' ? {} : { ability: 'core.account.merge' }), record: ['core.account', survivorId], detail: { mergedAccountId, mergeId, grantsReplaced: ended.size, startedBy: input.startedBy ?? 'staff' } })
  return mergeId
}
