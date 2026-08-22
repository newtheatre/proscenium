import { workFoh } from '~~/shared/utils/abilities'

/** GET /api/foh/tonight: the performances this user may work tonight. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  return requireFohScope(user)
})
