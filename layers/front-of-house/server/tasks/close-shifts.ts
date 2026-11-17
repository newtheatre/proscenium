// Every 15 minutes: completes shifts past their window and opens tonight's draft reports.
import { defineTask } from '#kit'
import { closeShifts } from '../close'

export default defineTask(async (unit) => {
  await closeShifts(unit)
})
