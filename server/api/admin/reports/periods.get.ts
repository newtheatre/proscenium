import type { PeriodChoices } from '#shared/utils/season-dashboard'

// The terms and seasons the reports screen's period controls offer (E-126 criterion 5), gated on
// reports.read so choosing a range opens no finance permission. A label and a range, no figures.
export default defineEventHandler(async (event): Promise<PeriodChoices> => {
  await requirePermission(event, 'reports.read')
  const [periods, seasons] = await Promise.all([periodsList(), financeSeasons()])
  return {
    terms: periods.map(({ id, label, fromDay, toDay }) => ({ id, label, fromDay, toDay })),
    seasons,
  }
})
