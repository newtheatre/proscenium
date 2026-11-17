// My passkeys (ID-14).
import { z } from 'zod'
import { all, defineRoute } from '#kit'
import { sessionOf } from '../../../identity/guards'
import { authenticatorOf, authenticatorOffered } from '../../../identity/authenticator'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default', input: z.object({}) }, async (event) => {
  const session = await sessionOf(event)
  const rows = await all<{ id: string, label: string, synced: number, created_at: number, last_used_at: number | null }>('SELECT id, label, synced, created_at, last_used_at FROM core_passkeys WHERE account_id = ? ORDER BY created_at', session.accountId) // exact-account: identity's own table, keyed by the living account
  const codes = await all<{ n: number }>('SELECT count(*) AS n FROM core_recovery_codes WHERE account_id = ? AND used_at IS NULL', session.accountId) // exact-account: identity's own table, keyed by the living account
  return {
    passkeys: rows.map(r => ({ id: r.id, label: r.label, synced: !!r.synced, addedAt: r.created_at, lastUsedAt: r.last_used_at })),
    recoveryCodesLeft: codes[0]?.n ?? 0,
    // The authenticator app: shown to somebody it is offered to, or who already has one.
    authenticator: await authenticatorOf(session.accountId),
    authenticatorOffered: await authenticatorOffered(session.accountId),
  }
})
