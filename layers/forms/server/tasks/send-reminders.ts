// Daily: reminds people of unfinished and returned responses, and reviewers of reviews still owed.
import { defineTask, nowMs } from '#kit'
import { sendReminders } from '../reminders'

export default defineTask(async (unit) => {
  await sendReminders(unit, nowMs())
})
