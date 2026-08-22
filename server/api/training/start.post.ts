import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  target: z.enum(['bar-till', 'challenge-25', 'door-scan']),
})

/** POST /api/training/start: open a sandbox, if rehearsal says you may. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const { target } = await readValidatedBody(event, bodySchema.parse)

  const run = await startRun(user, target)

  return {
    id: run.id,
    targetKey: run.targetKey,
    expiresAt: run.expiresAt,
  }
})
