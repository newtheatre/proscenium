// Coming performances in a space the theatre manages that have no shifts yet, for the console home
// card of whoever runs the rota.
import { can, first, nowMs, type Actor } from '#kit'

const AHEAD = 14 * 24 * 60 * 60 * 1000 // not-policy: the fortnight the card looks ahead

export default {
  async value(actor: Actor) {
    if (!(await can(actor, 'front-of-house.shift.manage')).allowed) return 0
    const at = nowMs()
    const row = await first<{ n: number }>(
      `SELECT count(*) AS n FROM core_performances f LEFT JOIN core_spaces s ON s.id = f.space_id
        WHERE f.state = 'scheduled' AND f.starts_at >= ? AND f.starts_at < ? AND coalesce(s.managed, 1) <> 0
          AND NOT EXISTS (SELECT 1 FROM front_of_house_shifts h WHERE h.performance_id = f.id AND h.state <> 'cancelled')`,
      at, at + AHEAD)
    return row?.n ?? 0
  },
}
