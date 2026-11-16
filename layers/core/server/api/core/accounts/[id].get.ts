// A person's account as staff see it: identity's own facts, addresses, how they sign in, and
// their roles. Opening it is audited.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { all, defineRoute, nowMs, refuse } from '#kit'
import { accountById } from '../../../identity/accounts'
import { liveGrantsOf } from '../../../identity/grants'

export default defineRoute({
  ability: 'core.account.read',
  record: event => ['core.account', getRouterParam(event, 'id')],
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { record, unit }) => {
  const account = await accountById(record!.id)
  if (!account) refuse('core.not-found', 'There is no such person.', { status: 404 })
  const id = account.id
  const [addresses, passkeys, sessions, grants] = await Promise.all([
    all<{ id: string, address: string, verified_at: number | null }>('SELECT id, address, verified_at FROM core_account_emails WHERE account_id = ? ORDER BY created_at', id),
    all<{ id: string, label: string, created_at: number, last_used_at: number | null }>('SELECT id, label, created_at, last_used_at FROM core_passkeys WHERE account_id = ? ORDER BY created_at', id),
    all<{ n: number }>('SELECT count(*) AS n FROM core_sessions WHERE account_id = ? AND ended_at IS NULL AND expires_at > ?', id, nowMs()),
    liveGrantsOf(id),
  ])
  const providers = await all<{ provider: string }>('SELECT provider FROM core_federated_identities WHERE account_id = ?', id)
  unit.audit({ action: 'read', record: ['core.account', id] })
  return {
    id,
    name: account.name,
    preferredName: account.preferred_name,
    origin: account.origin,
    createdAt: account.created_at,
    claimed: !!account.first_signed_in_at,
    lastSignedInAt: account.last_signed_in_at,
    disabled: account.disabled_at ? { at: account.disabled_at, reason: account.disabled_reason } : null,
    mergedInto: account.merged_into_id,
    addresses: addresses.map(a => ({ id: a.id, address: a.address, verified: !!a.verified_at })),
    passkeys: passkeys.map(p => ({ id: p.id, label: p.label, addedAt: p.created_at, lastUsedAt: p.last_used_at })),
    providers: providers.map(p => p.provider),
    liveSessions: sessions[0]?.n ?? 0,
    grants: grants.map(g => ({ id: g.id, roleId: g.role_id, role: g.role_key, scope: g.scope, expiresAt: g.expires_at })),
  }
})
