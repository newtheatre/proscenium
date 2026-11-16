// Who holds what (ID-23): every grant of one person, or of one role, with its state and history.
import { z } from 'zod'
import { all, defineRoute, nowMs } from '#kit'
import { accountLabel } from '../../identity/accounts'

export default defineRoute({
  ability: 'core.grant.read',
  rateLimit: 'default',
  input: z.object({ accountId: z.string().max(40).optional(), roleId: z.string().max(40).optional() }), // not-policy: ids are short
}, async (_event, { input }) => {
  const where: string[] = []
  const params: unknown[] = []
  if (input.accountId) { where.push('g.account_id = ?'); params.push(input.accountId) }
  if (input.roleId) { where.push('g.role_id = ?'); params.push(input.roleId) }
  const rows = await all<{ id: string, account_id: string, role_id: string, role_name: string, scope: string, scope_module: string | null, scope_type: string | null, scope_id: string | null, starts_at: number, expires_at: number | null, granted_by: string | null, granted_at: number, ended_at: number | null, ended_reason: string | null, first_signed_in_at: number | null }>(
    `SELECT g.*, r.name AS role_name, e.ended_at, e.ended_reason, a.first_signed_in_at
       FROM core_grants g JOIN core_roles r ON r.id = g.role_id JOIN core_accounts a ON a.id = g.account_id
       LEFT JOIN core_grant_ends e ON e.grant_id = g.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY g.granted_at DESC LIMIT 500`, // not-policy: a page of grants
    ...params,
  )
  const at = nowMs()
  const grants = []
  for (const g of rows) {
    const state = g.ended_at ? 'ended' : g.expires_at && g.expires_at <= at ? 'expired' : !g.first_signed_in_at ? 'waiting-for-first-sign-in' : 'live'
    grants.push({
      id: g.id, accountId: g.account_id, person: await accountLabel(g.account_id), roleId: g.role_id, role: g.role_name,
      scope: { kind: g.scope, module: g.scope_module, type: g.scope_type, id: g.scope_id },
      startsAt: g.starts_at, expiresAt: g.expires_at, grantedBy: g.granted_by, grantedAt: g.granted_at, endedAt: g.ended_at, endedReason: g.ended_reason, state,
    })
  }
  return { grants }
})
