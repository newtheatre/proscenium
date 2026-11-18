// Daily: anonymises responses kept for as long as their form said (FB-602), and removes files that
// were uploaded for answers never sent.
import { defineTask, nowMs } from '#kit'
import { sweepRetention } from '../retention'
import { sweepAbandonedFiles } from '../files'

const FILES_BATCH = 200 // not-policy: one run's share, to keep the unit small; the next run takes the rest

export default defineTask(async (unit) => {
  const at = nowMs()
  await sweepRetention(unit, at)
  await sweepAbandonedFiles(unit, at, FILES_BATCH)
})
