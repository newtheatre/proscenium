import { financeScopeForm } from '#shared/utils/finance-reports'

// Foregone comps and discounts, and access/companion admissions, by show or by period (I-103
// criteria 1, 3). Treasurer and administrators; nothing here joins a need or a name.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'finance.read')
  const scope = await getValidatedQueryOrThrow(event, financeScopeForm)

  return { ok: true, report: await financeForegoneReport(scope) }
})
