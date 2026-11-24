// Every half hour: reminds booked people of sessions starting within the reminder window (P9).
import { defineTask } from '#kit'
import { sendReminders } from '../sessions'

export default defineTask(async (unit) => {
  await sendReminders(unit)
})
