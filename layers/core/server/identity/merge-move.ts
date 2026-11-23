// Stage two of a merge (part 4, Merge): the job core.merge-move. Stage one settled the person in one
// unit, touching the core's own tables only; this moves every other module's rows, in registry
// order, in units of work that never grow with the number of modules or rows.
//
// `start` queues one chain per module that has rows to move. Each `module` step is one unit: first
// the module's merge handlers, one per step, then its move columns, a share per step, so a unit
// stays inside core.units.statement-limit. The module's last step checks that none of its move
// columns still names the merged-away account, then queues `finish`, which sets completed_at once
// no chain is left. A handler that answers "not yet" makes its module's chain wait (job.defer) while
// the other modules carry on. Every statement only touches rows still naming the merged-away
// account and lists a row once, so any step, or the whole job, can run again and do no harm.
import { NOT_YET, all, first, isEnabled, moveAccountColumn, nowMs, useSetting, type MergeHandler, type MergeRef, type UnitView } from '#kit'
import { useRegistry } from '#kit/registry'
import { runMergeUndo } from './merge-undo'

/** The module stage one handles: its tables are the core's own, identity's among them. */
export const SETTLED_IN_STAGE_ONE = 'core'

/** Statements a step keeps free for the job's own bookkeeping, the guard and the next step. */
const RESERVE = 10 // not-policy: headroom inside core.units.statement-limit

export interface AccountColumnRule { module: string, table: string, column: string, onMerge: 'move' | 'alias' | 'handler' }

/** Every column in the registry that refers to an account, with its module and merge rule. */
export function accountColumns(): AccountColumnRule[] {
  const out: AccountColumnRule[] = []
  const tables = useRegistry().tables as Map<string, { module: string, meta: { columns: Record<string, { sql: string, meta: { account?: { onMerge?: string } } }> } }>
  for (const [table, { module, meta }] of tables) {
    for (const { sql, meta: column } of Object.values(meta.columns)) {
      if (!column.account) continue
      const onMerge = column.account.onMerge === 'move' || column.account.onMerge === 'handler' ? column.account.onMerge : 'alias'
      out.push({ module, table, column: sql, onMerge })
    }
  }
  return out
}

export interface MoveModule {
  module: string
  handlers: { id: string, handler: MergeHandler }[]
  moves: { table: string, column: string }[]
  /** Its `handler` columns, which its handlers settle. */
  handled: { table: string, column: string }[]
}

/**
 * The modules stage two works through, in registry order, with their handlers and move columns. A
 * module with `handler` columns and no core.merge-handler is a declaration problem, reported before
 * a merge writes anything.
 */
export function moveModules(): MoveModule[] {
  const registry = useRegistry()
  const columns = accountColumns()
  const out: MoveModule[] = []
  for (const [id, entry] of registry.modules) {
    if (id === SETTLED_IN_STAGE_ONE) continue
    const own = columns.filter(c => c.module === id)
    const moves = own.filter(c => c.onMerge === 'move').map(({ table, column }) => ({ table, column }))
    const handlers = (entry.manifest.contributes?.['core.merge-handler'] ?? []).map((c: { id: string, file?: string }) => ({
      id: c.id,
      handler: entry.handlers.contributions?.['core.merge-handler']?.[c.file ?? c.id] as MergeHandler,
    }))
    const unhandled = own.find(c => c.onMerge === 'handler')
    if (unhandled && !handlers.length) throw new Error(`${unhandled.table}.${unhandled.column} declares onMerge: 'handler' but ${id} contributes no core.merge-handler`)
    for (const h of handlers) if (typeof h.handler?.merge !== 'function') throw new Error(`${id}'s merge handler ${h.id} has no merge()`)
    const handled = own.filter(c => c.onMerge === 'handler').map(({ table, column }) => ({ table, column }))
    if (moves.length || handlers.length) out.push({ module: id, handlers, moves, handled })
  }
  return out
}

async function shares(moves: MoveModule['moves']): Promise<MoveModule['moves'][]> {
  const limit = await useSetting('core.units.statement-limit') as number
  const size = Math.max(1, Math.floor((limit - RESERVE) / 2)) // moveAccountColumn is two statements
  const out: MoveModule['moves'][] = []
  for (let i = 0; i < moves.length; i += size) out.push(moves.slice(i, i + size))
  return out
}

/** SQL that is true while none of `moves` names the account bound to each `?`. */
function noneLeft(moves: MoveModule['moves']): string {
  return moves.map(m => `NOT EXISTS (SELECT 1 FROM "${m.table}" WHERE "${m.column}" = ?)`).join(' AND ') || '1'
}

/** Whether any of `columns` still names the account. */
async function stillNamed(columns: MoveModule['moves'], accountId: string): Promise<boolean> {
  const row = await first<{ clear: number }>(`SELECT ${noneLeft(columns)} AS clear`, ...columns.map(() => accountId))
  return !row?.clear
}

interface MergeRow { id: string, survivor_id: string, merged_account_id: string, completed_at: number | null, undone_at: number | null }

export interface MergeMovePayload { mergeId: string, stage: 'start' | 'module' | 'finish' | 'undo-start' | 'undo-module' | 'undo-finish', module?: string, step?: number }

/** Starts stage two for a merge, in the unit that records it. */
export function startMergeMove(unit: UnitView, mergeId: string): void {
  unit.enqueue('core.merge-move', { mergeId, stage: 'start' }, { dedupeKey: `${mergeId}:start` })
}

export async function runMergeMove(unit: UnitView, payload: MergeMovePayload, job: { id: string, defer: (reason: string) => void }): Promise<void> {
  if (payload.stage.startsWith('undo')) return runMergeUndo(unit, payload, job)
  const merge = await first<MergeRow>('SELECT id, survivor_id, merged_account_id, completed_at, undone_at FROM core_account_merges WHERE id = ?', payload.mergeId)
  if (!merge || merge.completed_at || merge.undone_at) return
  const ref: MergeRef = { mergeId: merge.id, survivorId: merge.survivor_id, mergedAccountId: merge.merged_account_id }
  const modules = moveModules()

  if (payload.stage === 'start') {
    for (const { module } of modules) unit.enqueue('core.merge-move', { mergeId: merge.id, stage: 'module', module, step: 0 }, { dedupeKey: `${merge.id}:${module}:0` })
    if (!modules.length) finish(unit, ref, modules)
    return
  }
  if (payload.stage === 'finish') {
    // Another module's chain still to run will queue its own finish when it is done.
    const [waiting] = await all<{ n: number }>(
      `SELECT count(*) AS n FROM core_jobs WHERE name = 'core.merge-move' AND state IN ('queued', 'running') AND id <> ?
          AND json_extract(payload, '$.mergeId') = ? AND json_extract(payload, '$.stage') = 'module'`,
      job.id, merge.id,
    )
    if (!waiting?.n) finish(unit, ref, modules)
    return
  }

  const module = modules.find(m => m.module === payload.module)
  if (!module) {
    // The module is no longer installed: nothing of it is left to move.
    unit.enqueue('core.merge-move', { mergeId: merge.id, stage: 'finish' })
    return
  }
  // A switched-off module's handlers are not run. A handler may settle move columns as well as its
  // handler columns, so the chain waits while any of either names the merged-away account; where
  // none does there is nothing to settle and it goes straight on. A never-enabled module never waits.
  let step = payload.step ?? 0
  if (step < module.handlers.length && !(await isEnabled(module.module))) {
    if (await stillNamed([...module.handled, ...module.moves], ref.mergedAccountId)) {
      job.defer('core.merge.module-off')
      return
    }
    step = module.handlers.length
  }
  const parts = await shares(module.moves)
  const steps = module.handlers.length + parts.length
  if (step < module.handlers.length) {
    const answer = await module.handlers[step]!.handler.merge(unit, ref)
    if (answer === NOT_YET) {
      job.defer(`core.merge.not-yet:${module.module}`)
      return
    }
  }
  else {
    for (const { table, column } of parts[step - module.handlers.length] ?? []) moveAccountColumn(unit, { mergeId: merge.id, table, column, survivorId: ref.survivorId, mergedAccountId: ref.mergedAccountId })
  }
  if (step + 1 < steps) {
    unit.enqueue('core.merge-move', { mergeId: merge.id, stage: 'module', module: module.module, step: step + 1 }, { dedupeKey: `${merge.id}:${module.module}:${step + 1}` })
    return
  }
  // The module's last unit asserts its own completeness.
  unit.add({ sql: `UPDATE core_account_merges SET id = id WHERE id = ? AND ${noneLeft(module.moves)}`, params: [merge.id, ...module.moves.map(() => ref.mergedAccountId)] })
    .expect(1, { code: 'core.merge.incomplete', reason: `Some of ${module.module}'s rows still name the merged-away account.` })
  // No dedupe: a finish already running might have looked before this commit.
  unit.enqueue('core.merge-move', { mergeId: merge.id, stage: 'finish' })
}

/** Sets completed_at, only where no module's move column still names the merged-away account. */
function finish(unit: UnitView, ref: MergeRef, modules: MoveModule[]): void {
  const moves = modules.flatMap(m => m.moves)
  unit.add({
    sql: `UPDATE core_account_merges SET completed_at = ? WHERE id = ? AND completed_at IS NULL AND undone_at IS NULL AND ${noneLeft(moves)}`,
    params: [nowMs(), ref.mergeId, ...moves.map(() => ref.mergedAccountId)],
  })
}

/** How long a merge may stay unfinished before the sweep runs it again, and before health warns. */
const AGAIN_AFTER = 3_600_000 // not-policy: the specification's hour
export const STUCK_AFTER = 86_400_000 // not-policy: the specification's day

/**
 * For the hourly sweep: a merge still moving an hour after stage one, with no part of its job left
 * queued or running (a step died), is started again from the top. Repeating is harmless.
 */
export async function restartStalledMerges(unit: UnitView): Promise<void> {
  const stalled = await all<{ id: string }>(
    `SELECT m.id FROM core_account_merges m
      WHERE m.completed_at IS NULL AND m.undone_at IS NULL AND m.performed_at <= ?
        AND NOT EXISTS (SELECT 1 FROM core_jobs j WHERE j.name = 'core.merge-move' AND j.state IN ('queued', 'running') AND json_extract(j.payload, '$.mergeId') = m.id)
      LIMIT 20`, // not-policy: a sweep's batch
    nowMs() - AGAIN_AFTER,
  )
  for (const { id } of stalled) startMergeMove(unit, id)
}

/** Merges unfinished for more than a day, with the modules still holding them up. */
export async function stuckMerges(): Promise<{ id: string, modules: string[] }[]> {
  const rows = await all<{ id: string, modules: string | null }>(
    `SELECT m.id, (SELECT group_concat(DISTINCT json_extract(j.payload, '$.module')) FROM core_jobs j
                    WHERE j.name = 'core.merge-move' AND j.state IN ('queued', 'running', 'dead')
                      AND json_extract(j.payload, '$.mergeId') = m.id AND json_extract(j.payload, '$.stage') = 'module') AS modules
       FROM core_account_merges m
      WHERE m.completed_at IS NULL AND m.undone_at IS NULL AND m.performed_at <= ?`,
    nowMs() - STUCK_AFTER,
  )
  return rows.map(r => ({ id: r.id, modules: r.modules ? r.modules.split(',') : [] }))
}
