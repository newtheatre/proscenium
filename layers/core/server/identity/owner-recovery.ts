// Owner break-glass (ID-09): when every Owner is locked out, the person who runs the deployment
// sets CORE_OWNER_RECOVERY on the Worker and uses it once to enrol a new passkey on an existing
// Owner. It cannot make an Owner. Without the secret, or with the wrong one, the routes answer
// exactly as a missing page does; while the secret is set, the health check stays red.
import { credential, first, nowMs, refuse } from '#kit'
import { sameText } from './crypto'
import { normaliseAddress } from './accounts'
import { LIVE, OWNER } from './grants'

export async function requireRecoverySecret(given: string): Promise<void> {
  const secret = await credential('CORE_OWNER_RECOVERY')
  if (!secret || !sameText(secret, given)) refuse('core.not-found', 'There is nothing here.', { status: 404 })
}

/** The Owner account behind a verified address, or a refusal that names no account. */
export async function ownerByAddress(address: string): Promise<string> {
  const at = nowMs()
  const row = await first<{ id: string }>(
    `SELECT a.id FROM core_account_emails e
       JOIN core_accounts a ON a.id = e.account_id
       JOIN core_grants g ON g.account_id = a.id
       JOIN core_roles r ON r.id = g.role_id AND r.key = '${OWNER}'
      WHERE e.address = ? AND e.verified_at IS NOT NULL AND a.disabled_at IS NULL AND a.merged_into_id IS NULL AND a.anonymised_at IS NULL AND ${LIVE}
      LIMIT 1`,
    normaliseAddress(address), at, at,
  )
  if (!row) refuse('core.owner-recovery.not-owner', 'That address does not belong to an Owner.', { status: 422, remedy: 'Use the address of an existing Owner.' })
  return row.id
}
