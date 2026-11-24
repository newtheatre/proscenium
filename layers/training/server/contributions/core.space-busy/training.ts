// Training's sessions on the room calendar (P11): a published session with a space is busy there
// from start to end. It is not a booking and never gives way to one.
import { all } from '#kit'
import type { SpaceBusy } from '#modules/core'

export default {
  async busy({ spaceIds, from, to }, actor) {
    if (!spaceIds.length) return []
    const rows = await all<{ id: string, spaceId: string, from: number, to: number }>(
      `SELECT id, space_id AS spaceId, starts_at AS "from", ends_at AS "to" FROM training_sessions
        WHERE status = 'published' AND space_id IN (SELECT value FROM json_each(?1)) AND starts_at < ?3 AND ends_at > ?2 /* not-policy: bound parameters */`,
      JSON.stringify(spaceIds), from, to,
    )
    return rows.map(r => ({ spaceId: r.spaceId, kind: 'training-session', from: r.from, to: r.to, yields: false, record: { type: 'training.session', id: r.id }, label: actor ? 'Training session' : null }))
  },
} satisfies SpaceBusy
