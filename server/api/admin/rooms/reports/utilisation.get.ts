import { z } from 'zod'
import { conditionsOf, filterQuerySchema } from '#shared/utils/list-filters'
import { DAY } from '#shared/utils/series'
import { REPORT_PAGE_SIZE } from '#shared/utils/utilisation'
import { utilisationList } from '#shared/utils/utilisation-list'
import type { Breakdown } from '#shared/utils/utilisation'

const query = filterQuerySchema(utilisationList).extend({
  from: z.string().regex(DAY, 'Choose a day to report from'),
  to: z.string().regex(DAY, 'Choose a day to report to'),
}).refine(input => input.to >= input.from, {
  path: ['to'],
  message: 'A report ends on or after the day it starts',
})

// Booked hours against open hours, by room or by tier, filtered by its declaration (K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const by = (conditionsOf(utilisationList, input).find(condition => condition.key === 'by')?.values[0] as Breakdown | undefined) ?? 'room'
  const rows = await utilisation(by, input.from, input.to)
  // Searched rather than filtered in SQL: the rows are already aggregated in memory, and there
  // are never more of them than rooms or tiers (criterion 2).
  const term = input.search?.toLowerCase()
  const matched = term ? rows.filter(row => row.label.toLowerCase().includes(term)) : rows
  const start = (input.page - 1) * REPORT_PAGE_SIZE

  // An envelope, never a bare array, however few rows there are (criterion 3).
  return {
    from: input.from,
    to: input.to,
    by,
    items: matched.slice(start, start + REPORT_PAGE_SIZE),
    page: input.page,
    pageSize: REPORT_PAGE_SIZE,
    total: matched.length,
    pages: Math.max(1, Math.ceil(matched.length / REPORT_PAGE_SIZE)),
    // Totals describe the whole span, not only what the search box matched.
    totals: rows.reduce((sum, row) => ({
      confirmedHours: Math.round((sum.confirmedHours + row.confirmedHours) * 10) / 10,
      cancelledHours: Math.round((sum.cancelledHours + row.cancelledHours) * 10) / 10,
      noShowHours: Math.round((sum.noShowHours + row.noShowHours) * 10) / 10,
      openHours: Math.round((sum.openHours + row.openHours) * 10) / 10,
      bookings: sum.bookings + row.bookings,
    }), { confirmedHours: 0, cancelledHours: 0, noShowHours: 0, openHours: 0, bookings: 0 }),
  }
})
