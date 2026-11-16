// Undoing a merge, and closing it when the undo window passes (part 4, Merge, steps 6 and 7).
//
// Undo is allowed once the merge is complete and until undo_until. It sets undo_started_at, then the
// merge job runs backwards: each module, in a chain of its own, puts back the rows listed as moved
// (only those still naming the survivor, so a row that has moved on since stays where it is) and
// then runs its handlers' own undo, last handler first. The alias stands meanwhile, so readers see
// no change. A last unit puts the core's own rows back, gives back as new grants any grant the merge
// ended as a duplicate, clears the alias and marks the merge undone: that is when the two accounts
// part. Rows created since the merge stay with the survivor.
//
// Close: when the window passes on a complete merge that was not undone, rows handlers set aside are
// deleted (unless kept), the items go, and the merged-away account's own details are cleared. It
// stays an alias for ever, so append-only history still resolves.
import { NOT_YET, all, first, newId, nowMs, refuse, type Actor, type UnitView } from '#kit'
import { SETTLED_IN_STAGE_ONE, accountColumns, moveModules, stuckMerges, type MergeMovePayload } from './merge-move'

interface MergeRow {
  id: string
  survivor_id: string
  merged_account_id: string
  completed_at: number | null
  undo_started_at: number | null
  undone_by: string | null
  undone_at: number | null
}

/** The columns of a module whose listed moves an undo puts back: its move and handler columns. */
function listedColumns(module: string): { table: string, column: string }[] {
  return accountColumns().filter(c => c.module === module && c.onMerge !== 'alias').map(({ table, column }) => ({ table, column }))
}

/** Puts back one column's listed moves that still name the survivor. One statement. */
function putBack(unit: UnitView, merge: MergeRow, table: string, column: string): void {
  unit.add({
    sql: `UPDATE "${table}" SET "${column}" = ? WHERE "${column}" = ? AND rowid IN (
            SELECT CAST(row_id AS INTEGER) FROM core_account_merge_items WHERE merge_id = ? AND table_name = ? AND column_name = ? AND action = 'moved')`,
    params: [merge.merged_account_id, merge.survivor_id, merge.id, table, column],
  })
}

/**
 * Starts undoing a merge (ID-32). Refused unless it is complete, inside its window, not already
 * being undone, and the merged-away account still points at the survivor's current survivor (it
 * may have been merged on since; then the alias points further along, which is still this merge).
 */
export async function undoMerge(unit: UnitView, actor: Actor, mergeId: string): Promise<void> {
  const merge = await first<MergeRow>('SELECT * FROM core_account_merges WHERE id = ?', mergeId)
  if (!merge) refuse('core.not-found', 'There is no such merge.', { status: 404 })
  if (merge.undone_at || merge.undo_started_at) refuse('core.merge.undoing', 'This merge is already undone, or being undone.', { status: 409 })
  if (!merge.completed_at) refuse('core.merge.still-moving', 'This merge is still moving rows, so it cannot be undone yet.', { status: 409, remedy: 'Try again once it is complete.' })
  const at = nowMs()
  unit.add({
    sql: `UPDATE core_account_merges SET undo_started_at = ?, undone_by = ?
           WHERE id = ? AND completed_at IS NOT NULL AND undo_started_at IS NULL AND undone_at IS NULL AND undo_until > ?
             AND (SELECT merged_into_id FROM core_accounts WHERE id = merged_account_id AND anonymised_at IS NULL)
               = (SELECT coalesce(merged_into_id, id) FROM core_accounts WHERE id = survivor_id)`,
    params: [at, actor.accountId ?? null, mergeId, at],
  }).expect(1, { code: 'core.merge.cannot-undo', reason: 'This merge can no longer be undone.', remedy: 'Its undo window may have passed, or one of the accounts has changed since.' })
  unit.enqueue('core.merge-move', { mergeId, stage: 'undo-start' }, { dedupeKey: `${mergeId}:undo-start` })
  unit.audit({ action: 'state', ability: 'core.account.merge', record: ['core.account', merge.survivor_id], detail: { mergeId, undo: 'started', mergedAccountId: merge.merged_account_id } })
}

export async function runMergeUndo(unit: UnitView, payload: MergeMovePayload, job: { id: string, defer: (reason: string) => void }): Promise<void> {
  const merge = await first<MergeRow>('SELECT * FROM core_account_merges WHERE id = ?', payload.mergeId)
  if (!merge || !merge.undo_started_at || merge.undone_at) return
  const modules = moveModules()

  if (payload.stage === 'undo-start') {
    for (const { module } of modules) unit.enqueue('core.merge-move', { mergeId: merge.id, stage: 'undo-module', module, step: 0 }, { dedupeKey: `${merge.id}:undo:${module}:0` })
    if (!modules.length) unit.enqueue('core.merge-move', { mergeId: merge.id, stage: 'undo-finish' })
    return
  }
  if (payload.stage === 'undo-finish') {
    const [waiting] = await all<{ n: number }>(
      `SELECT count(*) AS n FROM core_jobs WHERE name = 'core.merge-move' AND state IN ('queued', 'running') AND id <> ?
          AND json_extract(payload, '$.mergeId') = ? AND json_extract(payload, '$.stage') = 'undo-module'`,
      job.id, merge.id,
    )
    if (!waiting?.n) await finishUndo(unit, merge)
    return
  }

  const module = modules.find(m => m.module === payload.module)
  const step = payload.step ?? 0
  // Reverse of the merge: the listed moves go back first, in one unit, then each handler's own undo, last first.
  const handlers = module ? [...module.handlers].reverse() : []
  if (module && step === 0) {
    for (const { table, column } of listedColumns(module.module)) putBack(unit, merge, table, column)
  }
  else if (module && step <= handlers.length) {
    const { id, handler } = handlers[step - 1]!
    const answer = handler.undo ? await handler.undo(unit, { mergeId: merge.id, survivorId: merge.survivor_id, mergedAccountId: merge.merged_account_id }) : undefined
    if (answer === NOT_YET) {
      job.defer(`core.merge.not-yet:${module.module}`)
      return
    }
    if (answer?.notRestored) {
      unit.audit({ action: 'state', record: ['core.account', merge.survivor_id], detail: { mergeId: merge.id, undo: 'not-restored', handler: id, notRestored: answer.notRestored, reason: answer.reason ?? null } })
    }
  }
  if (module && step < handlers.length) {
    unit.enqueue('core.merge-move', { mergeId: merge.id, stage: 'undo-module', module: module.module, step: step + 1 }, { dedupeKey: `${merge.id}:undo:${module.module}:${step + 1}` })
    return
  }
  unit.enqueue('core.merge-move', { mergeId: merge.id, stage: 'undo-finish' })
}

/** The last unit of an undo: the core's own rows, grants given back, the alias cleared. */
async function finishUndo(unit: UnitView, merge: MergeRow): Promise<void> {
  const at = nowMs()
  for (const { table, column } of listedColumns(SETTLED_IN_STAGE_ONE)) {
    if (table === 'core_grants') continue
    putBack(unit, merge, table, column)
  }
  // Accounts this one had absorbed were re-pointed at the survivor: they point at this one again.
  putBack(unit, merge, 'core_accounts', 'merged_into_id')
  // A grant the merge ended as a duplicate is given back, to the account it was given to, as a new
  // grant on the same terms: core_grants is append-only, so the ended one stays ended.
  const ended = await all<{ id: string, account_id: string, role_id: string, scope: string, scope_module: string | null, scope_type: string | null, scope_id: string | null, expires_at: number | null }>(
    `SELECT g.* FROM core_grants g JOIN core_account_merge_items i ON i.row_id = g.id
      WHERE i.merge_id = ? AND i.table_name = 'core_grants' AND i.action = 'ended' AND (g.expires_at IS NULL OR g.expires_at > ?)`,
    merge.id, at,
  )
  for (const g of ended) {
    const id = newId('gra')
    unit.add({
      sql: 'INSERT INTO core_grants (id, account_id, role_id, scope, scope_module, scope_type, scope_id, starts_at, expires_at, granted_by, granted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [id, g.account_id, g.role_id, g.scope, g.scope_module, g.scope_type, g.scope_id, at, g.expires_at, merge.undone_by, at],
    })
    unit.announce('core.grant.created', { grantId: id, accountId: g.account_id, roleId: g.role_id }, { record: ['core.grant', id] })
  }
  unit.add({ sql: 'UPDATE core_accounts SET merged_into_id = NULL, merged_at = NULL WHERE id = ? AND merged_into_id IS NOT NULL', params: [merge.merged_account_id] })
  unit.add({ sql: 'UPDATE core_account_merges SET undone_at = ? WHERE id = ? AND undone_at IS NULL', params: [at, merge.id] })
    .expect(1, { code: 'core.merge.undoing', reason: 'This merge was undone a moment ago.' })
  unit.announce('core.account.merge-undone', { survivorId: merge.survivor_id, mergedAccountId: merge.merged_account_id, mergeId: merge.id }, { record: ['core.account', merge.survivor_id] })
  unit.audit({ action: 'state', record: ['core.account', merge.survivor_id], detail: { mergeId: merge.id, undo: 'done', mergedAccountId: merge.merged_account_id, grantsGivenBack: ended.length } })
}

/** The personal details a closed merge clears from the merged-away account; it keeps its id and alias. */
const CLEARED = ['name', 'preferred_name', 'pronouns', 'phone']

/**
 * For the hourly sweep: closes complete merges whose undo window has passed. Rows handlers set
 * aside are deleted (a `set-aside-keep` row stays, under its module's own retention), the items go,
 * and the merged-away account's own details are cleared.
 */
export async function closeMerges(unit: UnitView): Promise<void> {
  const at = nowMs()
  const due = await all<{ id: string, merged_account_id: string }>(
    `SELECT id, merged_account_id FROM core_account_merges
      WHERE completed_at IS NOT NULL AND undo_started_at IS NULL AND undone_at IS NULL AND closed_at IS NULL AND undo_until <= ?
      ORDER BY undo_until LIMIT 10`, // not-policy: a sweep's batch, a few statements each
    at,
  )
  for (const merge of due) {
    const setAside = await all<{ table_name: string }>('SELECT DISTINCT table_name FROM core_account_merge_items WHERE merge_id = ? AND action = \'set-aside\'', merge.id)
    const known = new Set(accountColumns().map(c => c.table))
    for (const { table_name: table } of setAside) {
      if (!known.has(table)) continue
      unit.add({ sql: `DELETE FROM "${table}" WHERE rowid IN (SELECT CAST(row_id AS INTEGER) FROM core_account_merge_items WHERE merge_id = ? AND table_name = ? AND action = 'set-aside')`, params: [merge.id, table] })
    }
    unit.add({ sql: 'DELETE FROM core_account_merge_items WHERE merge_id = ?', params: [merge.id] })
    unit.add({ sql: `UPDATE core_accounts SET ${CLEARED.map(c => `${c} = NULL`).join(', ')} WHERE id = ? AND merged_into_id IS NOT NULL`, params: [merge.merged_account_id] })
    unit.add({ sql: 'UPDATE core_account_merges SET closed_at = ? WHERE id = ? AND closed_at IS NULL', params: [at, merge.id] })
  }
}

/** For the hourly sweep: an undo started more than an hour ago with no part of its job left is run again. */
export async function restartStalledUndos(unit: UnitView): Promise<void> {
  const stalled = await all<{ id: string }>(
    `SELECT m.id FROM core_account_merges m
      WHERE m.undo_started_at IS NOT NULL AND m.undone_at IS NULL AND m.undo_started_at <= ?
        AND NOT EXISTS (SELECT 1 FROM core_jobs j WHERE j.name = 'core.merge-move' AND j.state IN ('queued', 'running') AND json_extract(j.payload, '$.mergeId') = m.id)
      LIMIT 20`, // not-policy: a sweep's batch
    nowMs() - 3_600_000, // not-policy: the specification's hour
  )
  for (const { id } of stalled) unit.enqueue('core.merge-move', { mergeId: id, stage: 'undo-start' }, { dedupeKey: `${id}:undo-start` })
}

export interface MergeSummary {
  id: string
  survivor: { id: string, name: string | null }
  merged: { id: string, name: string | null }
  startedBy: 'person' | 'staff' | 'claim'
  performedAt: number
  undoUntil: number
  state: 'moving' | 'complete' | 'undoing' | 'undone' | 'closed'
  undoable: boolean
  /** Modules still holding up a merge unfinished for more than a day. */
  waitingOn: string[]
  /** What a module's own undo could not put back, with its reason code. */
  notRestored: { handler: string, count: number, reason: string | null }[]
}

const RECENT = 50 // not-policy: a screenful of recent merges

/** The Merges screen (identity spec part 6): recent merges, newest first, with where each stands. */
export async function recentMerges(): Promise<MergeSummary[]> {
  const at = nowMs()
  const rows = await all<MergeRow & { started_by: MergeSummary['startedBy'], performed_at: number, undo_until: number, closed_at: number | null, survivor_name: string | null, merged_name: string | null }>(
    `SELECT m.*, coalesce(s.preferred_name, s.name) AS survivor_name, coalesce(a.preferred_name, a.name) AS merged_name
       FROM core_account_merges m
       JOIN core_accounts s ON s.id = m.survivor_id
       JOIN core_accounts a ON a.id = m.merged_account_id
      ORDER BY m.performed_at DESC LIMIT ${RECENT}`,
  )
  const stuck = new Map((await stuckMerges()).map(s => [s.id, s.modules]))
  const notes = rows.length
    ? await all<{ detail: string }>(
        `SELECT detail FROM core_audit WHERE record_type = 'core.account' AND json_extract(detail, '$.undo') = 'not-restored'
          AND json_extract(detail, '$.mergeId') IN (${rows.map(() => '?').join(', ')})`,
        ...rows.map(r => r.id),
      )
    : []
  const kept = new Map<string, MergeSummary['notRestored']>()
  for (const { detail } of notes) {
    const d = JSON.parse(detail) as { mergeId: string, handler: string, notRestored: number, reason?: string | null }
    kept.set(d.mergeId, [...(kept.get(d.mergeId) ?? []), { handler: d.handler, count: d.notRestored, reason: d.reason ?? null }])
  }
  return rows.map((r) => {
    const state: MergeSummary['state'] = r.undone_at ? 'undone' : r.undo_started_at ? 'undoing' : r.closed_at ? 'closed' : r.completed_at ? 'complete' : 'moving'
    return {
      id: r.id,
      survivor: { id: r.survivor_id, name: r.survivor_name },
      merged: { id: r.merged_account_id, name: r.merged_name },
      startedBy: r.started_by,
      performedAt: r.performed_at,
      undoUntil: r.undo_until,
      state,
      undoable: state === 'complete' && r.undo_until > at,
      waitingOn: stuck.get(r.id) ?? [],
      notRestored: kept.get(r.id) ?? [],
    }
  })
}
