import { workFoh } from '~~/shared/utils/abilities'

/** GET /api/bar/tabs/holders, who the till may start a tab for. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  await requireBarScope(user)

  const holders = await tabHolders()
  if (!holders) {
    // Stage-door could not say, so the till asks for an email instead.
    return { available: false, holders: [], softCapPence: TAB_SOFT_CAP_PENCE }
  }

  const outstanding = await outstandingByHolder(holders.map(holder => holder.userId))

  return {
    available: true,
    softCapPence: TAB_SOFT_CAP_PENCE,
    holders: holders.map(holder => ({
      ...holder,
      outstandingPence: outstanding.get(holder.userId) ?? 0,
    })),
  }
})
