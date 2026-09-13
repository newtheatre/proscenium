import { reportPeriodForm } from '#shared/utils/bar-reports'

// Sales, GP, variance, comps and discounts for a period, read live (F-119 criteria 1, 4). The
// bar manager, the treasurer and administrators (criterion 5), never the wider catalogue reader.
export default defineEventHandler(async (event) => {
  await requireAnyPermission(event, ['bar.read', 'finance.read'])
  const period = await getValidatedQueryOrThrow(event, reportPeriodForm)

  return { ok: true, report: await barReport(period) }
})
