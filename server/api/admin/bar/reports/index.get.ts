import { reportPeriodForm } from '#shared/utils/bar-reports'

// Sales, GP, variance, comps and discounts for a period, read live (F-119 criteria 1, 4). Bar
// manager and administrators; no distinct treasurer permission exists yet (known-issues.md).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const period = await getValidatedQueryOrThrow(event, reportPeriodForm)

  return { ok: true, report: await barReport(period) }
})
