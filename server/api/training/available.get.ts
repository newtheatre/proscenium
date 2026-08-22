import { workFoh } from '~~/shared/utils/abilities'

/** GET /api/training/available: which sandboxes this person could open now. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)

  // With no open window this is empty, so the home shows no tile and no hint
  // that the feature exists (docs/14 §3.1).
  return { targets: await availableTargets(user.id) }
})
