// An account's scope (R-34): the survivor of any merges the account went into, and every account
// merged into that survivor. A merge aliases account columns rather than rewriting them, so a read
// "by account" asks for the scope. Stand-in for the kit's helpers of the same names and signatures,
// as the Foundations Doc names them ("The account scope"); when the kit's land, callers change one
// import. Core only: not exported for other modules.
import { sql, type SQL } from 'drizzle-orm'
import { all } from '#kit'

const MERGE_DEPTH = 8 // not-policy: a chain of merges is short; more means a loop

/** The scope as common table expressions ending in `scope(id, depth)`, survivor at depth 0. */
function scopeTables(accountId: string): SQL {
  return sql`WITH RECURSIVE up(id, depth) AS (
      SELECT ${accountId}, 0
      UNION ALL SELECT a.merged_into_id, u.depth + 1 FROM core_accounts a JOIN up u ON a.id = u.id
        WHERE a.merged_into_id IS NOT NULL AND u.depth < ${MERGE_DEPTH}
    ), survivor(id) AS (SELECT id FROM up ORDER BY depth DESC LIMIT 1),
    scope(id, depth) AS (
      SELECT id, 0 FROM survivor
      UNION SELECT a.id, s.depth + 1 FROM core_accounts a JOIN scope s ON a.merged_into_id = s.id WHERE s.depth < ${MERGE_DEPTH}
    )`
}

/**
 * The scope as a subquery of account ids, for `IN (...)`. A survivor's id or a merged-away id gives
 * the same set, resolved inside the statement, so a unit needs no read first.
 */
export function accountScope(accountId: string): SQL {
  return sql`${scopeTables(accountId)} SELECT id FROM scope`
}

/** The condition "`column` holds an account in the scope of `accountId`", for any statement. */
export function inAccountScope(column: SQL, accountId: string): SQL {
  return sql`${column} IN (${accountScope(accountId)})`
}

/** The scope's ids, survivor first. For display, logs and tests; never bind them into an IN list. */
export async function accountScopeIds(accountId: string): Promise<string[]> {
  const rows = await all<{ id: string }>(`WITH RECURSIVE up(id, depth) AS (
      SELECT ?, 0 UNION ALL SELECT a.merged_into_id, u.depth + 1 FROM core_accounts a JOIN up u ON a.id = u.id WHERE a.merged_into_id IS NOT NULL AND u.depth < ?
    ), survivor(id) AS (SELECT id FROM up ORDER BY depth DESC LIMIT 1),
    scope(id, depth) AS (SELECT id, 0 FROM survivor UNION SELECT a.id, s.depth + 1 FROM core_accounts a JOIN scope s ON a.merged_into_id = s.id WHERE s.depth < ?)
    SELECT id FROM scope ORDER BY depth, id`, accountId, MERGE_DEPTH, MERGE_DEPTH)
  return rows.map(r => r.id)
}

/**
 * `accountScopeIds` for many accounts in one read, keyed by the id asked for. Not in the Foundations
 * list yet (asked for): notify's dedupe hashes each id in the Worker, for hundreds of recipients.
 */
export async function accountScopeIdsFor(accountIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>(accountIds.map(id => [id, []]))
  if (!accountIds.length) return out
  const rows = await all<{ root: string, id: string }>(`WITH RECURSIVE up(root, id, depth) AS (
      SELECT value, value, 0 FROM json_each(?)
      UNION ALL SELECT u.root, a.merged_into_id, u.depth + 1 FROM core_accounts a JOIN up u ON a.id = u.id WHERE a.merged_into_id IS NOT NULL AND u.depth < ?
    ), survivor(root, id) AS (SELECT root, id FROM up u WHERE depth = (SELECT max(depth) FROM up WHERE root = u.root)),
    scope(root, id, depth) AS (SELECT root, id, 0 FROM survivor UNION SELECT s.root, a.id, s.depth + 1 FROM core_accounts a JOIN scope s ON a.merged_into_id = s.id WHERE s.depth < ?)
    SELECT root, id FROM scope ORDER BY depth, id`, JSON.stringify([...new Set(accountIds)]), MERGE_DEPTH, MERGE_DEPTH)
  for (const row of rows) out.get(row.root)?.push(row.id)
  return out
}
