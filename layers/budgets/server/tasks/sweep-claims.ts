// Daily: undecided claims and requests are chased, claims past retention anonymised, and lines over budget told.
import { defineTask } from '#kit'
import { chaseApprovers, sweepOverBudget, sweepRetention } from '../sweeps'

export default defineTask(async (unit) => {
  await chaseApprovers(unit)
  await sweepRetention(unit)
  await sweepOverBudget(unit)
})
