import { boardEntries, boardWindowBounds, boardWindowQuery } from '#shared/utils/rota-board'
import { currentShowNight, showNightOpensAt } from '#shared/utils/show-night'
import type { RosterOpening, RosterOpeningShiftRow, RosterPerformanceRow, RosterShiftRow } from '#server/utils/rota'

// Every non-cancelled shift on the nights the window names, whole rather than paged (E-107
// criterion 7), with the planned bar openings among them to read, not to act on (E-130 criterion 8).

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rota.write')
  const window = await getValidatedQueryOrThrow(event, boardWindowQuery)
  const bounds = boardWindowBounds(window)
  // The approvals queue: claims to confirm from tonight's show night on, whatever the window.
  const tonight = showNightOpensAt(currentShowNight())
  const scope = window.waiting ? { waitingFrom: tonight } : bounds

  const [performances, shifts, openings, openingShifts, [claims]] = await Promise.all([
    db.all<RosterPerformanceRow>(rosterPerformancesQuery(scope)),
    db.all<RosterShiftRow>(rosterShiftsQuery(scope)),
    window.waiting ? Promise.resolve([]) : db.all<RosterOpening>(rosterOpeningsQuery(bounds)),
    window.waiting ? Promise.resolve([]) : db.all<RosterOpeningShiftRow>(rosterOpeningShiftsQuery(bounds)),
    db.all<{ waiting: number }>(waitingClaimsQuery(tonight)),
  ])

  return {
    from: window.from,
    to: window.to,
    waiting: Number(claims?.waiting ?? 0),
    items: boardEntries(
      performances.map(performance => ({
        ...performance,
        isExternal: performance.isExternal === 1,
        hasTemplate: performance.hasTemplate === 1,
        isRetired: performance.isRetired === 1,
        shifts: shifts.filter(shift => shift.performanceId === performance.performanceId),
      })),
      openings.map(opening => ({
        ...opening,
        shifts: openingShifts.filter(shift => shift.openingId === opening.openingId),
      })),
    ),
  }
})
