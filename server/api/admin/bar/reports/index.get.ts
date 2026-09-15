import { reportPeriodForm } from '#shared/utils/bar-reports'
import { pageQuery } from '#shared/utils/pagination'

// Sales, GP, variance, comps, discounts and wastage for a period, read live (F-119, 0079). The
// bar manager, the treasurer and administrators (criterion 5), never the wider catalogue reader.

// One page applies to both unbounded sections: comps and variance are each one row per event, so
// a season is unbounded in both and neither may answer whole (criterion 2).
export default defineEventHandler(async (event) => {
  await requireAnyPermission(event, ['bar.read', 'finance.read'])
  const { page, pageSize, ...period } = await getValidatedQueryOrThrow(event, reportPeriodForm.and(pageQuery))

  return { ok: true, report: await barReport(period, { page, pageSize }) }
})
