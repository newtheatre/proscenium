// The daily sweep of verification lists. An entry's name is erased once
// membership.verification.names-keep-for has passed since its end date (V18). An entry goes when its
// list's valid_until has passed, or when it has been kept membership.verification.list-keep-for: an
// entry that no membership was ever checked against is deleted, and one that was is kept as that
// check's record with its hash and name gone, so it matches nothing again.
import { defineTask, nowMs, retentionSeconds, useSetting } from '#kit'
import { ERASED } from '#kit/db'
import { verificationEntries } from '../db/schema'
import { addDays } from '../dates'
import { todayOrNull } from '../memberships'

const DAY = 86_400 // not-policy: seconds in a day
const SECOND = 1000 // not-policy: milliseconds in a second

export default defineTask(async (unit) => {
  const day = await todayOrNull()
  if (!day) return
  const keepDays = Math.floor(Number(await useSetting('membership.verification.names-keep-for') ?? 0) / DAY)
  unit.add({ sql: 'UPDATE membership_verification_entries SET holder_name = NULL WHERE holder_name IS NOT NULL AND ends_on IS NOT NULL AND ends_on < ?', params: [addDays(day, -keepDays)] })

  const keep = await retentionSeconds(verificationEntries)
  const cutAt = keep === null ? 0 : nowMs() - keep * SECOND
  // ?1 is today, ?2 the oldest creation time kept.
  const due = 'e.list_id IN (SELECT id FROM membership_verification_lists WHERE valid_until IS NOT NULL AND valid_until < ?1) OR e.created_at < ?2'
  const checked = 'EXISTS (SELECT 1 FROM membership_verifications v WHERE v.entry_id = e.id)'
  unit.add({ sql: `DELETE FROM membership_verification_entries AS e WHERE (${due}) AND NOT ${checked} AND e.used_by IS NULL`, params: [day, cutAt] })
  unit.add({ sql: `UPDATE membership_verification_entries AS e SET key_hash = '${ERASED.anonymise}:' || e.id, holder_name = NULL WHERE (${due}) AND e.key_hash NOT LIKE '${ERASED.anonymise}:%'`, params: [day, cutAt] })
  // The count staff see follows what is left to match.
  unit.add({ sql: `UPDATE membership_verification_lists SET entry_count = (SELECT count(*) FROM membership_verification_entries e WHERE e.list_id = membership_verification_lists.id AND e.key_hash NOT LIKE '${ERASED.anonymise}:%')`, params: [] })
})
