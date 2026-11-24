// Hourly: each open invoice's reminder that has fallen due, once the day's sending time has passed (I-31).
import { defineTask } from '#kit'
import { sendReminders } from '../sending'

export default defineTask(async (unit) => {
  await sendReminders(unit)
})
