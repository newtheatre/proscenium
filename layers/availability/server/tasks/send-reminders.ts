// Hourly: one reminder to each person still asked as each reminder setting passes before the due date (R3).
import { defineTask } from '#kit'
import { sendReminders } from '../requests'

export default defineTask(async (unit) => {
  await sendReminders(unit)
})
