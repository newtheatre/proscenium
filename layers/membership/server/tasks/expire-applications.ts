// Rule J5: an application past its expires_at becomes `expired`, and its charge is voided with any
// payment still open for it. expires_at is set only while the next step is the applicant's (a fee to
// pay), so an application waiting on staff never expires.
import { all, defineTask, nowMs } from '#kit'
import { charger } from '../charge'

export default defineTask(async (unit) => {
  const at = nowMs()
  const due = await all<{ id: string }>("SELECT id FROM membership_memberships WHERE state = 'pending' AND expires_at IS NOT NULL AND expires_at < ?", at)
  if (!due.length) return
  unit.add({
    sql: "UPDATE membership_memberships SET state = 'expired', updated_at = ?1 WHERE state = 'pending' AND expires_at IS NOT NULL AND expires_at < ?1",
    params: [at],
  })
  const fees = await charger()
  for (const { id } of due) await fees?.void(unit, id)
})
