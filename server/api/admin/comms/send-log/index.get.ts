import { sendLogFilters } from '#shared/utils/notification-log'

// Every send, filterable by type, topic, channel, outcome and date range (H-106 criterion 1).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'comms.operations')
  const filters = await getValidatedQueryOrThrow(event, sendLogFilters)

  const [items, total] = await Promise.all([
    sendLog(filters, filters.pageSize, offsetFor(filters.page, filters.pageSize)),
    countSendLog(filters),
  ])

  return envelope(items, total, filters.page, filters.pageSize)
})
