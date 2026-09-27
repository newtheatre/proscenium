import type { Period } from '#shared/utils/period-locks'
import type { FinanceSeason } from '#shared/utils/season-dashboard'

// The money screens' period controls, their terms and seasons read through the finance gate the
// screen already holds (0087): one loader, so the dashboard and revenue by show cannot drift.
export function useFinancePeriodForm(key: string): ReturnType<typeof usePeriodForm> {
  const request = useRequestFetch()
  return usePeriodForm(key, () => Promise.all([
    request<{ periods: Period[] }>('/api/admin/finance/terms'),
    request<{ seasons: FinanceSeason[] }>('/api/admin/finance/seasons'),
  ]).then(([terms, seasons]) => ({
    terms: terms.periods.map(({ id, label, fromDay, toDay }) => ({ id, label, fromDay, toDay })),
    seasons: seasons.seasons,
  })))
}
