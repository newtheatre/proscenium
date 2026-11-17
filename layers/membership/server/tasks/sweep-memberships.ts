// Retention of ended and lapsed memberships (membership.retention.ended-after, counted from ends_on
// or ended_at, whichever is later). The row stays, with its scheme and dates, so counts by year stay
// true and the member's history keeps its shape; what goes is the free text: the membership's note
// and the notes on its checks. A current membership is never touched.
import { defineTask, nowMs, retentionSeconds } from '#kit'
import { ERASED } from '#kit/db'
import { memberships } from '../db/schema'
import { addDays } from '../dates'
import { todayOrNull } from '../memberships'

const DAY = 86_400 // not-policy: seconds in a day
const SECOND = 1000 // not-policy: milliseconds in a second

export default defineTask(async (unit) => {
  const day = await todayOrNull()
  const keep = await retentionSeconds(memberships)
  if (!day || keep === null) return
  const at = nowMs()
  const cutDay = addDays(day, -Math.floor(keep / DAY))
  const cutAt = at - keep * SECOND
  // Past retention: finished (declined, expired or ended) long enough ago, or lapsed long enough ago.
  // ?a is the cut as a time, ?b as a local date.
  const due = (a: string, b: string) => `SELECT id FROM membership_memberships WHERE (state IN ('declined', 'expired', 'ended') AND coalesce(ended_at, updated_at) < ${a} AND (ends_on IS NULL OR ends_on < ${b})) OR (state = 'active' AND ends_on IS NOT NULL AND ends_on < ${b})`
  unit.add({
    sql: `UPDATE membership_verifications SET note = '${ERASED.redact}' WHERE note IS NOT NULL AND note <> '${ERASED.redact}' AND membership_id IN (${due('?1', '?2')})`,
    params: [cutAt, cutDay],
  })
  unit.add({
    sql: `UPDATE membership_memberships SET note = '${ERASED.redact}', updated_at = ?1 WHERE note IS NOT NULL AND note <> '${ERASED.redact}' AND id IN (${due('?2', '?3')})`,
    params: [at, cutAt, cutDay],
  })
})
