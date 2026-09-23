import { suExportForm } from '#shared/utils/su-export'
import type { SuExportCoverage } from '#shared/utils/su-export'

// What a download would cover before it is taken (I-108 criterion 4): its days, whether they are
// closed so two runs match, and the row count the cap is checked against. Nothing leaves: no audit.
export default defineEventHandler(async (event): Promise<SuExportCoverage> => {
  await requirePermission(event, 'finance.export')
  const period = await getValidatedQueryOrThrow(event, suExportForm)
  const { fromDay, toDay } = await resolvePeriodBounds(period)
  const [rows, closed] = await Promise.all([suExportRowCount(fromDay, toDay), isRangeClosed(fromDay, toDay)])
  return { fromDay, toDay, rows, closed }
})
