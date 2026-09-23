import { boardEntries, boardWindowBounds, boardWindowQuery } from '#shared/utils/rota-board'
import type { RosterOpening, RosterOpeningShiftRow, RosterPerformance, RosterShiftRow } from '#server/utils/rota'

// Every non-cancelled shift on the nights the window names, whole rather than paged (E-107
// criterion 7), with the planned bar openings among them to read, not to act on (E-130 criterion 8).

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rota.write')
  const window = await getValidatedQueryOrThrow(event, boardWindowQuery)
  const bounds = boardWindowBounds(window)

  const [performances, shifts, openings, openingShifts] = await Promise.all([
    db.all<RosterPerformance>(rosterPerformancesQuery(bounds)),
    db.all<RosterShiftRow>(rosterShiftsQuery(bounds)),
    db.all<RosterOpening>(rosterOpeningsQuery(bounds)),
    db.all<RosterOpeningShiftRow>(rosterOpeningShiftsQuery(bounds)),
  ])

  return {
    from: window.from,
    to: window.to,
    items: boardEntries(
      performances.map(performance => ({
        ...performance,
        shifts: shifts.filter(shift => shift.performanceId === performance.performanceId),
      })),
      openings.map(opening => ({
        ...opening,
        shifts: openingShifts.filter(shift => shift.openingId === opening.openingId),
      })),
    ),
  }
})
