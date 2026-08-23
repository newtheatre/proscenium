import { workFoh } from '~~/shared/utils/abilities'
import { practiceWindow } from '~~/server/utils/eligibility'

/** GET /api/training/state: is a sandbox open, for how long, and what happened in it. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const run = await activeRun(user.id)

  if (!run) return { active: false as const, targetKey: null, expiresAt: null, events: [] }

  // Re-asked, not assumed, so closing the register upstream ends this within a
  // poll (docs/14 §9). Only CLOSED ends it: ending a run deletes its events.
  const upstream = await practiceWindow(user.id, run.targetKey)
  if (upstream.status === 'CLOSED') {
    await endRun(run.id, 'ENDED')
    return { active: false as const, targetKey: null, expiresAt: null, events: [] }
  }

  return {
    active: true as const,
    targetKey: run.targetKey,
    expiresAt: run.expiresAt,
    events: await eventsFor(run.id),
  }
})
