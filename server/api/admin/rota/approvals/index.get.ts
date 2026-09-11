import { filterQuerySchema } from '#shared/utils/list-filters'
import { rotaApprovalsList } from '#shared/utils/rota-approvals-list'
import type { PendingApprovalRow } from '#server/utils/rota'

const query = filterQuerySchema(rotaApprovalsList)

// The FOH officer's approval list: every claim queued in E-105's queue mode, filtered by its
// declaration (E-105 criterion 2, K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rota.write')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = pendingApprovalsClause(input)

  const [items, [totalRow]] = await Promise.all([
    db.all<PendingApprovalRow>(pendingApprovalsQuery(clause, input.pageSize, offsetFor(input.page, input.pageSize))),
    db.all<{ total: number }>(countPendingApprovalsQuery(clause)),
  ])

  return envelope(items, totalRow?.total ?? 0, input.page, input.pageSize)
})
