// Erases the name on a list entry once membership.verification.names-keep-for has passed since its
// end date (V18). The entries themselves go with the table's retention.
import { defineTask, useSetting } from '#kit'
import { addDays } from '../dates'
import { todayOrNull } from '../memberships'

const DAY = 86_400 // not-policy: seconds in a day

export default defineTask(async (unit) => {
  const day = await todayOrNull()
  if (!day) return
  const keepDays = Math.floor(Number(await useSetting('membership.verification.names-keep-for') ?? 0) / DAY)
  unit.add({ sql: 'UPDATE membership_verification_entries SET holder_name = NULL WHERE holder_name IS NOT NULL AND ends_on IS NOT NULL AND ends_on < ?', params: [addDays(day, -keepDays)] })
})
