// Versions of a policy: its whole text as it read at one time. A version is written the first time
// the text is found to differ from every version kept, so a change of wording, of a setting the
// policy quotes or of which modules are on each makes one. A version is never changed, and what a
// person agreed to points at one.
import { all, createUnit, first, newId, nowMs } from '#kit'
import { shortHash } from '../../shared/policies'
import { listPolicies, policyText, resolvePolicy } from './service'

export interface PolicyVersion { id: string, policy: string, number: number, title: string, createdAt: number }
interface Row { id: string, policy: string, number: number, title: string, created_at: number }
const toVersion = (r: Row): PolicyVersion => ({ id: r.id, policy: r.policy, number: r.number, title: r.title, createdAt: r.created_at })

const ATTEMPTS = 3 // not-policy: tries at writing a version while another request writes one too

/**
 * The version that says what the policy says now, written if this is the first time it reads so.
 * Null where there is no such policy. It commits on its own: a version is a fact about the policy,
 * true whether or not the booking that asked for it goes through.
 */
export async function currentVersion(policyId: string): Promise<PolicyVersion | null> {
  const resolved = await resolvePolicy(policyId)
  if (!resolved) return null
  const body = policyText(resolved)
  const hash = shortHash(body)
  const find = () => first<Row>('SELECT id, policy, number, title, created_at FROM core_policy_versions WHERE policy = ? AND hash = ?', policyId, hash)
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const found = await find()
    if (found) return toVersion(found)
    // Two requests may write at once: the same text is kept once (the hash), and two different
    // texts cannot take the same number, so the loser of either race looks again.
    await createUnit().add({
      sql: `INSERT OR IGNORE INTO core_policy_versions (id, policy, number, hash, title, body, created_at)
        SELECT ?, ?, COALESCE(MAX(number), 0) + 1, ?, ?, ?, ? FROM core_policy_versions WHERE policy = ?`,
      params: [newId('pvn'), policyId, hash, resolved.policy.title, body, nowMs(), policyId],
    }).commit()
  }
  const found = await find()
  return found ? toVersion(found) : null
}

/** Writes a version of every policy that reads differently from what is kept. */
export async function recordVersions(): Promise<void> {
  for (const policy of await listPolicies()) await currentVersion(policy.id)
}

/** A policy's versions, newest first. */
export async function versionsOf(policyId: string): Promise<PolicyVersion[]> {
  return (await all<Row>('SELECT id, policy, number, title, created_at FROM core_policy_versions WHERE policy = ? ORDER BY number DESC', policyId)).map(toVersion)
}

/** One version's text, by its number within the policy. */
export async function versionText(policyId: string, number: number): Promise<(PolicyVersion & { body: string }) | null> {
  const row = await first<Row & { body: string }>('SELECT id, policy, number, title, body, created_at FROM core_policy_versions WHERE policy = ? AND number = ?', policyId, number)
  return row ? { ...toVersion(row), body: row.body } : null
}
