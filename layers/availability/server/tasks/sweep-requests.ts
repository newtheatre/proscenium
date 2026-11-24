// Daily at 04:30: joiners asked and leavers withdrawn (R2, R6); people still asked after the due date
// lapse (R5); a request past its last date closes (R7).
import { defineTask } from '#kit'
import { sweepRequests } from '../requests'

export default defineTask(async (unit) => {
  await sweepRequests(unit)
})
