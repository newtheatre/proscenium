import { REPORT_EXPORT_LIMIT, reportQuery, usedShare } from '#shared/utils/utilisation'

// Quoted always: a room name with a comma in it would otherwise split the row.
const cell = (value: unknown): string => `"${String(value ?? '').replaceAll('"', '""')}"`

// The same figures as CSV, which is what a year-end review is written from.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.read')
  const input = await getValidatedQueryOrThrow(event, reportQuery)

  const rows = (await utilisation(input.by, input.from, input.to)).slice(0, REPORT_EXPORT_LIMIT)

  const lines = [
    [input.by, 'confirmedHours', 'cancelledHours', 'noShowHours', 'openHours', 'usedPercent', 'bookings']
      .map(cell).join(','),
    ...rows.map(row => [
      row.label,
      row.confirmedHours,
      row.cancelledHours,
      row.noShowHours,
      row.openHours,
      usedShare(row) ?? '',
      row.bookings,
    ].map(cell).join(',')),
  ]

  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition',
    `attachment; filename="room-utilisation-${input.from}-to-${input.to}.csv"`)

  return `${lines.join('\n')}\n`
})
