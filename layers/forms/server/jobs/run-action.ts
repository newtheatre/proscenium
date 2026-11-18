// Runs one outcome action for one move of one response (FB-506).
import { defineJob, nowMs } from '#kit'
import { runAction } from '../actions'

export default defineJob<{ runId: string }>(async (payload, unit) => {
  await runAction(unit, payload.runId, nowMs())
})
