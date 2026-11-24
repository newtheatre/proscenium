// Every 15 minutes: Confirmed bookings past their end become Completed, requests past their start
// become Expired (rules A6 and the sweep). One set per run, in the task's unit; a long backlog is
// cleared over the next runs.
import { defineTask } from '#kit'
import { sweepBookings } from '../changes'

const PER_RUN = 200 // not-policy: one set within the kit's set-rows limit

export default defineTask(async (unit) => {
  await sweepBookings(unit, PER_RUN)
})
