// Rule J5: an application past its expires_at becomes `expired`. expires_at is set only while the
// next step is the applicant's (a form to finish, a fee to pay), so an application waiting on staff
// never expires. Nothing sets it yet: every application so far waits on staff.
import { defineTask, nowMs } from '#kit'

export default defineTask(async (unit) => {
  const at = nowMs()
  unit.add({
    sql: "UPDATE membership_memberships SET state = 'expired', updated_at = ?1 WHERE state = 'pending' AND expires_at IS NOT NULL AND expires_at < ?1",
    params: [at],
  })
})
