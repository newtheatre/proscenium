import { workFoh } from '~~/shared/utils/abilities'
import { practiceWindow } from '~~/server/utils/eligibility'

/** GET /api/training/state: is a sandbox open, for how long, and what happened in it. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const run = await activeRun(user.id)

  if (!run) return { active: false as const, targetKey: null, expiresAt: null, events: [] }

  // Re-asked, not assumed: a lead marking the register in rehearsal ends the
  // sandbox here within a poll, which is the reset promise (docs/14 §9).
  const upstream = await practiceWindow(user.id, run.targetKey)
  if (!upstream.active) {
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
