// Daily at 09:00: the incident digest for managers, and reminders to action owners (FH-28, FH-29).
import { defineTask } from '#kit'
import { chaseActions, sendDigest } from '../incidents'

export default defineTask(async (unit) => {
  await sendDigest(unit)
  await chaseActions(unit)
})
