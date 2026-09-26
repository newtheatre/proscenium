import { z } from 'zod'
import { rotaNightBounds } from '#shared/utils/my-rota'
import { SHIFT_ROLES } from '#shared/utils/rota'
import type { OpenOpeningShiftRow } from '#server/utils/bar-openings'
import type { OpenShiftFilters, OpenShiftRow } from '#server/utils/rota'

const LONDON_DATE = /^\d{4}-\d{2}-\d{2}$/

// A night holds a handful of openings, not a page of them, so the list is capped rather than paged.
const OPENING_SLOT_CAP = 50

const query = pageQuery.extend({
  role: z.enum(SHIFT_ROLES).optional(),
  from: z.string().regex(LONDON_DATE, 'Give the night as YYYY-MM-DD').optional(),
  to: z.string().regex(LONDON_DATE, 'Give the night as YYYY-MM-DD').optional(),
  // "Shifts you can take": only roles the caller qualifies for, never a performance they already
  // work (issue 1335). Absent lists every open shift, each with its own gate.
  claimable: z.enum(['true', 'false']).optional().transform(value => value === 'true'),
})

// The open-shift list, gated live against training records: no cache, no network seam and no
// fail-open path (E-103 criteria 1 and 5).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const { page, pageSize, role, from, to, claimable } = await getValidatedQueryOrThrow(event, query)

  const now = Math.floor(Date.now() / 1000)
  const eligibilities = await shiftEligibilities(event, account.id, londonToday())

  const filters: OpenShiftFilters = {
    role,
    roles: claimable ? SHIFT_ROLES.filter(one => eligibilities[one].eligible) : undefined,
    notWorkedBy: claimable ? account.id : undefined,
    // Show nights, held whole from 04:00 to 04:00 as the rota board's window is (0014).
    ...rotaNightBounds({ from, to }),
  }
  // Every slot on a bar opening is a bar slot, so they ride the bar role's filter and the bar
  // role's gate; they are their own list because an opening names no show to page alongside one.
  const barOffered = (role === undefined || role === 'BAR') && (!claimable || eligibilities.BAR.eligible)

  const [items, [totalRow], openings] = await Promise.all([
    db.all<OpenShiftRow>(openShiftsQuery(filters, now, pageSize, offsetFor(page, pageSize))),
    db.all<{ total: number }>(countOpenShiftsQuery(filters, now)),
    barOffered
      ? db.all<OpenOpeningShiftRow>(openOpeningShiftsQuery(filters, now, OPENING_SLOT_CAP, filters.notWorkedBy))
      : Promise.resolve([] as OpenOpeningShiftRow[]),
  ])

  // Whom a member asks about a role nobody can claim yet (issue 1318); the claimable list holds
  // no such role, and My rota reads them from the roles endpoint.
  const officers = !claimable && Object.values(eligibilities).some(one => !one.eligible && one.unlockedBy === null)
    ? await fohManagerNames()
    : []

  return {
    ...envelope(items.map(item => ({ ...item, ...eligibilities[item.role] })), totalRow?.total ?? 0, page, pageSize),
    openings: openings.map(opening => ({ ...opening, ...eligibilities.BAR })),
    officers,
  }
})
