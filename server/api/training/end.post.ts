import { workFoh } from '~~/shared/utils/abilities'

/** POST /api/training/end: shut the sandbox and delete what it did. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const run = await activeRun(user.id)

  // Idempotent: ending a run that already ended is what the banner does on a
  // slow connection, and it is not an error.
  if (!run) return { ended: false }

  await endRun(run.id, 'ENDED')
  return { ended: true }
})
