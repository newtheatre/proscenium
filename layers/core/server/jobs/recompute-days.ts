// Recalculates every stored operating day after the time zone or the rollover changes (C-37).
import { defineJob } from '#kit'
import { recomputeDays } from '../calendar'

export default defineJob(async () => {
  await recomputeDays()
})
