// A stand-in for the kit's account scope (ruling R-34; Foundations, data-class registry, "The
// account scope") until the kit exports it under these names. An account column is compared with a
// person through their scope, the survivor of any merge and every account merged into it, worked out
// inside the statement, so rows not yet moved by a merge still read as theirs. Replace the import
// with #kit when it lands.

const SCOPE = `WITH RECURSIVE up(id) AS (SELECT ? UNION SELECT a.merged_into_id FROM core_accounts a JOIN up ON a.id = up.id WHERE a.merged_into_id IS NOT NULL),
  root(id) AS (SELECT id FROM up WHERE NOT EXISTS (SELECT 1 FROM core_accounts a WHERE a.id = up.id AND a.merged_into_id IS NOT NULL) LIMIT 1),
  down(id) AS (SELECT id FROM root UNION SELECT a.id FROM core_accounts a JOIN down ON a.merged_into_id = down.id)
  SELECT id FROM down`

/** The subquery of the account's survivor and its aliases, with its one parameter. */
export function accountScope(accountId: string): { sql: string, params: unknown[] } {
  return { sql: `(${SCOPE})`, params: [accountId] }
}

/** The condition "column is this person", for reads, counts and guards. */
export function inAccountScope(column: string, accountId: string): { sql: string, params: unknown[] } {
  return { sql: `${column} IN (${SCOPE})`, params: [accountId] }
}

/** The one escape: the stored id itself, for a rule that compares stored ids. Give the reason beside it. */
export function exactAccount(column: string, accountId: string): { sql: string, params: unknown[] } {
  return { sql: `${column} = ?`, params: [accountId] }
}
