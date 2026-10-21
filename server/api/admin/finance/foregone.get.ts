import { financeForegoneForm } from '#shared/utils/finance-reports'
import type { FinanceScopeInput } from '#shared/utils/finance-reports'

// Foregone comps and discounts, and access/companion admissions, by show or by period (I-103
// criteria 1, 3). Treasurer and administrators; nothing here joins a need or a name.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'finance.read')
  const asked = await getValidatedQueryOrThrow(event, financeForegoneForm)
  const scope: FinanceScopeInput = 'scope' in asked
    ? asked
    : await resolvePeriodBounds(asked).then(({ fromDay, toDay }) => ({ scope: 'PERIOD' as const, from: fromDay, to: toDay }))

  return { ok: true, report: await financeForegoneReport(scope) }
})
