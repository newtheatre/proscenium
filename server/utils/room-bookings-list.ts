import { schema } from '@nuxthub/db'
import { and, gt, lte, sql } from 'drizzle-orm'
import { conditionsOf } from '#shared/utils/list-filters'
import { roomBookingsList } from '#shared/utils/room-bookings-list'
import { tableColumns, whereFrom, yes, yesNo } from './list-filters'
import type { ListQuery } from '#shared/utils/list-filters'
import type { ListClause, Reference } from './list-filters'

// The no-show record standing against a booking, or null: latest entry wins, ties on rowid, the
// same rule the ladder counts by (C-116 criterion 2, 0010).
export const standingNoShow = sql<string | null>`(
  SELECT CASE WHEN n.kind = 'RECORDED' THEN n.id END FROM room_no_shows n
  WHERE n.booking_id = ${schema.roomBookings.id}
  ORDER BY n.recorded_at DESC, n.rowid DESC
  LIMIT 1
)`

// Qualified: the listing joins rooms and users, each with a `rowid` of its own.
function bookingColumn(name: string): Reference | undefined {
  if (name === 'rowid') return sql`${schema.roomBookings}.rowid`
  return tableColumns(schema.roomBookings)(name)
}

// The officer's bookings list (C-115 criterion 6, K-129). The caller joins rooms and users, whose
// names the search runs over.
export function bookingsClause(query: ListQuery, now: number): ListClause {
  const clause = whereFrom(roomBookingsList, query, {
    column: bookingColumn,
    search: [schema.roomBookings.title, schema.users.name, schema.rooms.name],
    fields: {
      past: yesNo(lte(schema.roomBookings.endsAt, now)),
      noShow: yesNo(sql`${standingNoShow} IS NOT NULL`),
    },
  })
  // A no-show is always in the past, so asking for one is asking for the past as well; asking
  // for bookings not marked is not.
  const asked = conditionsOf(roomBookingsList, query)
    .some(condition => condition.key === 'past' || (condition.key === 'noShow' && yes(condition)))
  return asked ? clause : { ...clause, where: and(gt(schema.roomBookings.endsAt, now), clause.where) }
}
