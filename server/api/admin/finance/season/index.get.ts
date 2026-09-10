import { periodForm } from '#shared/utils/season-dashboard'

// The season dashboard's summary (I-105 criteria 2, 4): the treasurer and administrators see it
// in full; the committee sees the same aggregates without the entry-level drill-down.
export default defineEventHandler(async (event) => {
  await requireAnyPermission(event, ['finance.read', 'finance.summary'])
  const period = await getValidatedQueryOrThrow(event, periodForm)

  return { ok: true, summary: await seasonSummary(period) }
})
