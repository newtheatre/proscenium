// One chunk of a long run of performances (C-04), made or removed, then the next chunk queued.
// Safe to repeat: a chunk already made is left alone.
import { defineJob } from '#kit'
import { runChunk } from '../programme/runs'

export default defineJob<{ runId: string }>(async ({ runId }, unit) => {
  await runChunk(unit, runId)
})
