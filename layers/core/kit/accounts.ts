// The account scope (Foundations, Data-class registry, "The account scope"). A merge leaves most
// account columns holding the id they were written with (onMerge 'alias') and moves the rest in
// stages as a job, so a read by account never compares a column to one id: it asks for "the
// survivor and its aliases", worked out inside the same statement, so a unit needs no read first.
// The conformance check refuses eq, inArray or raw SQL that compares a col.account column to a
// value; these helpers are what it accepts.
import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { all } from './database'
import type { UnitView } from './unit'

/** A column as a Drizzle column or SQL, or a plain name such as `account_id` or `o.account_id`. */
export type AccountColumn = SQLWrapper | string

const NAME = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/

function columnSql(column: AccountColumn): SQL {
  if (typeof column !== 'string') return sql`${column}`
  if (!NAME.test(column)) throw new Error(`"${column}" is not a column name`)
  return sql.raw(column)
}

/** An account: its id, or an SQL expression that yields one, such as a json_each value in a set. */
export type AccountRef = string | SQL

const value = (account: AccountRef): SQL => typeof account === 'string' ? sql`${account}` : sql`(${account})`

/**
 * The survivor of `account`: itself, or the account it was merged into. Identity keeps
 * `merged_into_id` pointing at the final survivor, so one level is enough. An id with no account
 * row stands for itself.
 */
function survivorSql(account: AccountRef): SQL {
  return sql`coalesce((SELECT coalesce(merged_into_id, id) FROM core_accounts WHERE id = ${value(account)}), ${value(account)})`
}

/**
 * The account scope as a subquery: the survivor of `account` and every account merged into it.
 * Takes a survivor's id or a merged-away one, or an SQL expression, so a set-wise statement can
 * work it out row by row; either way the survivor is resolved inside the statement.
 */
export function accountScope(account: AccountRef): SQL {
  const s = survivorSql(account)
  return sql`SELECT ${s} AS id UNION SELECT id FROM core_accounts WHERE merged_into_id = ${s}`
}

/** `column IN (the scope)`: for reads, updates, counts, claim conditions and set-wise INSERT ... SELECT. */
export function inAccountScope(column: AccountColumn, account: AccountRef): SQL {
  return sql`${columnSql(column)} IN (${accountScope(account)})`
}

/**
 * `column = accountId`, exactly. The one escape from the scope: for identity's own tables and the
 * merge job. Anywhere else the line needs a trailing `// exact-account: <reason>`.
 */
export function exactAccount(column: AccountColumn, accountId: string): SQL {
  return sql`${columnSql(column)} = ${accountId}`
}

/** The scope's ids, survivor first: for display, logs and tests only, never bound into an IN list. */
export async function accountScopeIds(accountId: string): Promise<string[]> {
  const rows = await all<{ id: string }>(`SELECT id FROM (${accountScopeSql('?1')}) ORDER BY id = ${survivorText('?1')} DESC, id`, accountId)
  return rows.map(r => r.id)
}

const survivorText = (p: string) => `coalesce((SELECT coalesce(merged_into_id, id) FROM core_accounts WHERE id = ${p}), ${p})`

/**
 * The scope as plain SQL, for engines that build statements as text (erasure): `placeholder` is
 * a numbered parameter such as `?1` holding the account id. Use inAccountScope everywhere else.
 */
export function accountScopeSql(placeholder: string): string {
  if (!/^\?\d+$/.test(placeholder)) throw new Error('accountScopeSql takes a numbered parameter such as ?1')
  const s = survivorText(placeholder)
  return `SELECT ${s} AS id UNION SELECT id FROM core_accounts WHERE merged_into_id = ${s}`
}

/**
 * What a merge did to a listed row: moved to the survivor, ended as history, or set aside (taken
 * out of use). A set-aside row is deleted when the undo window closes, unless the handler said to
 * keep it (`set-aside-keep`: a record in its own right, under the module's own retention).
 */
export type MergeItemAction = 'moved' | 'ended' | 'set-aside' | 'set-aside-keep'

const IDENT = /^[a-z][a-z0-9_]*$/

/**
 * For a merge handler: lists into the merge's items every row of `table` whose `column` still
 * holds the merged-away account, with what the handler is about to do to it, so the merge can be
 * undone. Call it before the statement that changes the rows. One statement whatever the row
 * count, and safe to run twice. A row a handler takes out of use is listed as `set-aside`, with
 * `onClose` saying what the close of the undo window does with it: `delete` (the default) or
 * `keep`. The merge item goes either way. No column is added to module tables.
 */
export function recordMergeItems(unit: UnitView, input: { mergeId: string, table: string, column: string, mergedAccountId: string, action?: 'moved' | 'ended' | 'set-aside', onClose?: 'delete' | 'keep', where?: SQL }): void {
  const { table, column } = input
  if (!IDENT.test(table) || !IDENT.test(column)) throw new Error('recordMergeItems takes a table and column name')
  if (input.onClose && input.action !== 'set-aside') throw new Error('onClose is for a set-aside row')
  const action: MergeItemAction = input.action === 'set-aside' && input.onClose === 'keep' ? 'set-aside-keep' : input.action ?? 'moved'
  const extra = input.where ? sql` AND (${input.where})` : sql``
  unit.add(sql`INSERT OR IGNORE INTO core_account_merge_items (merge_id, table_name, column_name, row_id, action) SELECT ${input.mergeId}, ${table}, ${column}, rowid, ${action} FROM ${sql.identifier(table)} WHERE ${exactAccount(sql.identifier(column), input.mergedAccountId)}${extra}`)
}

/**
 * Re-points one move column from the merged-away account to the survivor, listing each row first:
 * the two statements of the merge job's step for one column. Both can be repeated.
 */
export function moveAccountColumn(unit: UnitView, input: { mergeId: string, table: string, column: string, survivorId: string, mergedAccountId: string }): void {
  recordMergeItems(unit, { ...input, action: 'moved' })
  unit.add(sql`UPDATE ${sql.identifier(input.table)} SET ${sql.identifier(input.column)} = ${input.survivorId} WHERE ${exactAccount(sql.identifier(input.column), input.mergedAccountId)}`)
}

/** The merge a handler is asked to act on. */
export interface MergeRef { mergeId: string, survivorId: string, mergedAccountId: string }

/** "Not yet": the module's handlers and moves wait while the merge job carries on with other modules. */
export const NOT_YET = 'not-yet' as const

/**
 * A module's merge handler, for its onMerge 'handler' columns: tables where both accounts may hold
 * a row a person may hold only once. Within a module every handler runs before the module's move
 * columns are re-pointed; on undo the order is reversed. Each call fits one unit and is safe to
 * run twice.
 */
export interface MergeHandler {
  /** Reconciles the module's rows, listing every row it changes with recordMergeItems. */
  merge: (unit: UnitView, merge: MergeRef) => Promise<void> | Promise<MergeAnswer> | MergeAnswer
  /**
   * The handler's own undo, where putting the listed values back would be wrong. Answers what
   * could not be put back, as a count with a reason code, for the Merges screen and the audit.
   */
  undo?: (unit: UnitView, merge: MergeRef) => Promise<MergeUndoAnswer | typeof NOT_YET> | MergeUndoAnswer | typeof NOT_YET
}

export interface MergeUndoAnswer { notRestored: number, reason?: string }

/** A handler's answer: nothing (done) or NOT_YET. */
export type MergeAnswer = typeof NOT_YET | undefined
