// My signed-in browsers (ID-13): each one's device, when it started and was last used, and which is this one.
import { z } from 'zod'
import { all, defineRoute, nowMs } from '#kit'
import { sessionOf } from '../../../identity/guards'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default', input: z.object({}) }, async (event) => {
  const session = await sessionOf(event)
  const rows = await all<{ id: string, device: string, created_at: number, last_seen_at: number, assurance: string }>(
    'SELECT id, device, created_at, last_seen_at, assurance FROM core_sessions WHERE account_id = ? AND ended_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC', // exact-account: identity's own table, keyed by the living account
    session.accountId, nowMs(),
  )
  return { sessions: rows.map(r => ({ id: r.id, device: r.device, startedAt: r.created_at, lastUsedAt: r.last_seen_at, strong: r.assurance === 'strong', current: r.id === session.id })) }
})
