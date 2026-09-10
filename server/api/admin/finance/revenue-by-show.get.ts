import { periodForm } from '#shared/utils/season-dashboard'

// Revenue by show: collected, unrefunded ticket money only, gross, refunded and net reported
// separately (I-106 criteria 1, 2). Treasurer and administrators only.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'finance.read')
  const period = await getValidatedQueryOrThrow(event, periodForm)

  return { ok: true, report: await revenueByShowReport(period) }
})
