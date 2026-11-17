// Sends the shift reminders that are due (FH-15).
import { defineTask } from '#kit'
import { sendReminders } from '../reminders'

export default defineTask(async (unit) => {
  await sendReminders(unit)
})
