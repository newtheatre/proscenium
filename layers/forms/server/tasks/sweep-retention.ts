// Daily: anonymises responses kept for as long as their form said (FB-602).
import { defineTask, nowMs } from '#kit'
import { sweepRetention } from '../retention'

export default defineTask(async (unit) => {
  await sweepRetention(unit, nowMs())
})
