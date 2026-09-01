import { REPORT_PAGE_SIZE, reportQuery } from '#shared/utils/utilisation'

// Booked hours against open hours, by room or by tier.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.read')
  const input = await getValidatedQueryOrThrow(event, reportQuery)

  const rows = await utilisation(input.by, input.from, input.to)
  const start = (input.page - 1) * REPORT_PAGE_SIZE

  // An envelope, never a bare array, however few rows there are (criterion 3).
  return {
    from: input.from,
    to: input.to,
    by: input.by,
    items: rows.slice(start, start + REPORT_PAGE_SIZE),
    page: input.page,
    pageSize: REPORT_PAGE_SIZE,
    total: rows.length,
    pages: Math.max(1, Math.ceil(rows.length / REPORT_PAGE_SIZE)),
    totals: rows.reduce((sum, row) => ({
      confirmedHours: Math.round((sum.confirmedHours + row.confirmedHours) * 10) / 10,
      cancelledHours: Math.round((sum.cancelledHours + row.cancelledHours) * 10) / 10,
      noShowHours: Math.round((sum.noShowHours + row.noShowHours) * 10) / 10,
      openHours: Math.round((sum.openHours + row.openHours) * 10) / 10,
      bookings: sum.bookings + row.bookings,
    }), { confirmedHours: 0, cancelledHours: 0, noShowHours: 0, openHours: 0, bookings: 0 }),
  }
})
