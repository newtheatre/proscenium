// Withdraws one's own application before it is active (J6): it ends with reason by-holder.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, nowMs, refuse } from '#kit'
import { accountScopeSql } from '#kit/accounts'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { actor, unit }) => {
  const id = getRouterParam(event, 'id')
  const mine = await first(`SELECT 1 FROM membership_memberships WHERE id = ?1 AND state = 'pending' AND account_id IN (${accountScopeSql('?2')})`, id, actor.accountId)
  if (!mine) refuse('core.not-found', 'You have no open application with that reference.', { status: 404 })
  const at = nowMs()
  unit.add({ sql: 'UPDATE membership_memberships SET state = \'ended\', end_reason = \'by-holder\', ended_at = ?, ended_by = ?, updated_at = ? WHERE id = ? AND state = \'pending\'', params: [at, actor.accountId, at, id] })
    .expect(1, { code: 'membership.application.changed', reason: 'This application has already been dealt with.', remedy: 'Reload the page.' })
  unit.audit({ action: 'state', record: ['membership.membership', id!], detail: { to: 'ended', reason: 'by-holder' } })
  return { state: 'ended' }
})
