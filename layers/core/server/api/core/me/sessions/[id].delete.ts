// End one of my sessions. It stops on its next request (ID-13).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, nowMs } from '#kit'
import { sessionOf } from '../../../../identity/guards'
import { clearSessionCookie } from '../../../../identity/web'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { unit }) => {
  const session = await sessionOf(event)
  const id = getRouterParam(event, 'id') ?? ''
  unit.add({ sql: 'UPDATE core_sessions SET ended_at = ?, ended_reason = \'ended_by_person\' WHERE id = ? AND account_id = ? AND ended_at IS NULL', params: [nowMs(), id, session.accountId] })
    .expect(1, { code: 'core.not-found', reason: 'There is no such session.' })
  if (id === session.id) unit.afterCommit(() => clearSessionCookie(event))
  return { ended: id }
})
