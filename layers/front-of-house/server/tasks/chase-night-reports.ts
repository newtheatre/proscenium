// Daily at 10:00: tells those who sign off about nights still unsigned (FH-33).
import { defineTask } from '#kit'
import { chaseReports } from '../reports'

export default defineTask(async (unit) => {
  await chaseReports(unit)
})
