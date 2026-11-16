// Identity's own erasure hold: an Owner is not erased while no other Owner could still sign in.
// The erasure batch also asserts it, so a race between two Owners cannot remove both.
import { first, nowMs } from '#kit'
import type { ErasureHold } from '../../points/erasure-hold'
import { isOwner, LIVE, OWNER } from '../../identity/grants'

export default {
  async holds(accountId) {
    if (!(await isOwner(accountId))) return []
    const at = nowMs()
    const other = await first<{ id: string }>(
      `SELECT a.id FROM core_grants g
         JOIN core_roles r ON r.id = g.role_id AND r.key = '${OWNER}'
         JOIN core_accounts a ON a.id = g.account_id
        WHERE ${LIVE} AND a.id <> ?
          AND a.first_signed_in_at IS NOT NULL AND a.disabled_at IS NULL AND a.merged_into_id IS NULL AND a.anonymised_at IS NULL
          AND EXISTS (SELECT 1 FROM core_passkeys p WHERE p.account_id = a.id)
        LIMIT 1`, at, at, accountId)
    return other ? [] : ['core.erasure.last-owner']
  },
} satisfies ErasureHold
