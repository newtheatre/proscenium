// Marks copies past reports.runs.keep-for as expired, set-wise (R7); core's files sweep removes their files.
import { defineTask } from '#kit'
import { expireRuns } from '../runs'

export default defineTask(async () => {
  await expireRuns()
})
