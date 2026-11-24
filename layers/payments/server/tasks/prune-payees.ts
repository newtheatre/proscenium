// Clears bank details nobody has been paid with for payments.payees.keep-for, counted from the last
// payment to them or, never paid, from when they were saved. The row stays, so past payments still name it.
import { defineTask, localDate, nowMs, useSetting } from '#kit'

const SECOND = 1000 // not-policy: milliseconds in a second

export default defineTask(async (unit) => {
  const keep = await useSetting('payments.payees.keep-for') as number
  const before = nowMs() - keep * SECOND
  unit.add({
    sql: `UPDATE payments_payees SET account_name = NULL, sort_code = NULL, account_number = NULL, last_digits = NULL, updated_at = ?
      WHERE last_digits IS NOT NULL AND (CASE WHEN last_used_on IS NULL THEN created_at < ? ELSE last_used_on < ? END)`,
    params: [nowMs(), before, await localDate(before)],
  })
})
