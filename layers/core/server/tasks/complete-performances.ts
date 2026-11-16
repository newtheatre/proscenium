// Every five minutes (C-12): scheduled performances that have ended become completed, each
// announced once, even if two runs overlap.
import { defineTask } from '#kit'
import { completeEnded } from '../programme/performances'

export default defineTask(async (unit) => {
  await completeEnded(unit)
})
