// A holder ends their own membership, where the scheme allows it (holder_may_end). It ends today and
// returns no fee by itself.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, refuse } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { endMembership } from '../../../../ending'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { actor, unit }) => {
  const id = getRouterParam(event, 'id')
  const mine = await first<{ may: number }>(
    `SELECT s.holder_may_end AS may FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id WHERE m.id = ?1 AND m.state = 'active' AND m.account_id IN (${accountScopeSql('?2')})`,
    id, actor.accountId,
  )
  if (!mine) refuse('core.not-found', 'You have no current membership with that reference.', { status: 404 })
  if (!mine!.may) refuse('membership.end.not-by-holder', 'This membership cannot be ended here.', { status: 409, remedy: 'Contact the theatre to end it.' })
  endMembership(unit, { id: id!, reason: 'by-holder', by: actor.accountId! })
  return { state: 'ended' }
})
