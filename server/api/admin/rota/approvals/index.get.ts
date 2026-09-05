import type { PendingApprovalRow } from '#server/utils/rota'

// The FOH officer's approval list: every claim queued in E-105's queue mode, waiting on a
// decision (E-105 criterion 2).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rota.write')
  const { page, pageSize } = await getValidatedQueryOrThrow(event, pageQuery)

  const [items, [totalRow]] = await Promise.all([
    db.all<PendingApprovalRow>(pendingApprovalsQuery(pageSize, offsetFor(page, pageSize))),
    db.all<{ total: number }>(countPendingApprovalsQuery()),
  ])

  return envelope(items, totalRow?.total ?? 0, page, pageSize)
})
