// Checks and cleans an upload (C-23, C-36). A refusal is an outcome, recorded and announced, not a
// failure: only an error reaching storage makes the job retry.
import { defineJob } from '#kit'
import { checkStoredFile, fileRow } from '../files/service'

export default defineJob<{ fileId: string }>(async ({ fileId }, unit) => {
  const row = await fileRow(fileId)
  if (!row || row.state !== 'pending') return
  await checkStoredFile(row, unit)
})
