import { filterQuerySchema } from '#shared/utils/list-filters'
import { envelope, offsetFor } from '#shared/utils/pagination'
import { sendLogList } from '#shared/utils/send-log-list'

const query = filterQuerySchema(sendLogList)

// Every send, filtered by its declaration: type, topic, channel, outcome and date range (H-106
// criterion 1, K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'comms.operations')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = sendLogClause(input)

  const [items, total] = await Promise.all([
    sendLog(clause, input.pageSize, offsetFor(input.page, input.pageSize)),
    countSendLog(clause),
  ])

  return envelope(items, total, input.page, input.pageSize)
})
