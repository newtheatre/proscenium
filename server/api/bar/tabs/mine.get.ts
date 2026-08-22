import { runBarTab } from '~~/shared/utils/abilities'

/** GET /api/bar/tabs/mine, what you owe and what you have settled. */
export default defineEventHandler(async (event) => {
  await authorize(event, runBarTab)

  const { user } = await requireUserSession(event)

  const [outstanding, settled, outstandingPence] = await Promise.all([
    chargesFor(user.id),
    chargesFor(user.id, true),
    outstandingFor(user.id),
  ])

  return { outstanding, settled, outstandingPence, softCapPence: TAB_SOFT_CAP_PENCE }
})
