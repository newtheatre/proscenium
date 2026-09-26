import { z } from 'zod'
import { SHIFT_ROLES } from '#shared/utils/rota'
import type { OpenOpeningShiftRow } from '#server/utils/bar-openings'
import type { OpenShiftRow } from '#server/utils/rota'

const LONDON_DATE = /^\d{4}-\d{2}-\d{2}$/

// A night holds a handful of openings, not a page of them, so the list is capped rather than paged.
const OPENING_SLOT_CAP = 50

const query = pageQuery.extend({
  role: z.enum(SHIFT_ROLES).optional(),
  from: z.string().regex(LONDON_DATE, 'Give the date as YYYY-MM-DD').optional(),
  to: z.string().regex(LONDON_DATE, 'Give the date as YYYY-MM-DD').optional(),
})

// The open-shift list, gated live against training records: no cache, no network seam and no
// fail-open path (E-103 criteria 1 and 5).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const { page, pageSize, role, from, to } = await getValidatedQueryOrThrow(event, query)

  const now = Math.floor(Date.now() / 1000)
  const filters = {
    role,
    from: from ? Math.floor(startOfLondonDay(from).getTime() / 1000) : undefined,
    to: to ? Math.floor(endOfLondonDay(to).getTime() / 1000) : undefined,
  }

  const [items, [totalRow]] = await Promise.all([
    db.all<OpenShiftRow>(openShiftsQuery(filters, now, pageSize, offsetFor(page, pageSize))),
    db.all<{ total: number }>(countOpenShiftsQuery(filters, now)),
  ])

  const eligibilities = await shiftEligibilities(event, account.id, londonToday())
  const closed = Object.values(eligibilities).some(one => !one.eligible && one.unlockedBy === null)

  const [officers, openings] = await Promise.all([
    // Whom a member asks about a role nobody can claim yet (issue 1318).
    closed ? fohManagerNames() : Promise.resolve([] as string[]),
    // Every slot on a bar opening is a bar slot, so they ride the bar role's filter and the bar
    // role's gate; they are their own list because an opening names no show to page alongside one.
    role !== undefined && role !== 'BAR'
      ? Promise.resolve([] as OpenOpeningShiftRow[])
      : db.all<OpenOpeningShiftRow>(openOpeningShiftsQuery(filters, now, OPENING_SLOT_CAP)),
  ])

  return {
    ...envelope(items.map(item => ({ ...item, ...eligibilities[item.role] })), totalRow?.total ?? 0, page, pageSize),
    openings: openings.map(opening => ({ ...opening, ...eligibilities.BAR })),
    officers,
  }
})
