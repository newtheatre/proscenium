// Builds a person's data download (ID-15) and tells them it is ready. Safe to repeat: a request
// already finished or cancelled is left alone.
import { defineJob } from '#kit'
import { runExport } from '../identity/export'

export default defineJob<{ requestId: string }>(async ({ requestId }, unit) => {
  await runExport(unit, requestId)
})
