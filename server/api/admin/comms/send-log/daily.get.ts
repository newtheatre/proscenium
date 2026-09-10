import { dailyCountsFilters } from '#shared/utils/notification-log'

// Daily counts by type and outcome, so a silent provider outage shows as a dip (H-106 criterion 4).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'comms.operations')
  const { days } = await getValidatedQueryOrThrow(event, dailyCountsFilters)

  return { days: await dailyCounts(days) }
})
