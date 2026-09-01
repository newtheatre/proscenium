import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { fromLondonWallClock, londonWeekday } from '#shared/utils/london'
import { minutesOpen } from '#shared/utils/rooms'
import { addDays } from '#shared/utils/series'
import type { Breakdown, UtilisationRow } from '#shared/utils/utilisation'

// Counting hours (C-117). Every figure is summed in SQL rather than by fetching rows and adding
// them up, so a year of bookings is one statement and not a download (criterion 3).

// The London instants a span of London days covers. A report of "September" must not gain or lose
// an hour because the clocks moved inside it (0014).
export function boundsOf(from: string, to: string): { fromAt: number, toAt: number } {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = addDays(to, 1).split('-').map(Number)
  return {
    fromAt: Math.floor(fromLondonWallClock(fy!, fm!, fd!).getTime() / 1000),
    toAt: Math.floor(fromLondonWallClock(ty!, tm!, td!).getTime() / 1000),
  }
}

interface Counted {
  key: string
  label: string
  confirmedSeconds: number
  cancelledSeconds: number
  noShowSeconds: number
  bookings: number
}

// A no-show is counted as its own figure and not deducted from confirmed: the room was held and
// not used, which is exactly the number the review wants to see (criterion 1).
export async function countHours(by: Breakdown, fromAt: number, toAt: number): Promise<Counted[]> {
  const key = by === 'room' ? schema.roomBookings.roomId : schema.roomBookings.tier
  const label = by === 'room' ? schema.rooms.name : schema.roomBookings.tier

  return db.select({
    key,
    label,
    confirmedSeconds: sql<number>`coalesce(sum(case when ${schema.roomBookings.status} = 'CONFIRMED'
      and ${schema.roomBookings.id} not in (${CURRENTLY_MARKED})
      then ${schema.roomBookings.endsAt} - ${schema.roomBookings.startsAt} else 0 end), 0)`,
    cancelledSeconds: sql<number>`coalesce(sum(case when ${schema.roomBookings.status} in ('CANCELLED', 'REJECTED', 'BUMPED')
      then ${schema.roomBookings.endsAt} - ${schema.roomBookings.startsAt} else 0 end), 0)`,
    noShowSeconds: sql<number>`coalesce(sum(case when ${schema.roomBookings.id} in (${CURRENTLY_MARKED})
      then ${schema.roomBookings.endsAt} - ${schema.roomBookings.startsAt} else 0 end), 0)`,
    bookings: sql<number>`count(*)`,
  })
    .from(schema.roomBookings)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomBookings.roomId))
    .where(and(
      gte(schema.roomBookings.startsAt, fromAt),
      lt(schema.roomBookings.startsAt, toAt),
    ))
    .groupBy(key)
}

// What the policy engine says a room is open for, walked day by day: the same hours a booking is
// judged against, so the denominator and the rule can never disagree (criterion 1).
export function openHoursFor(hours: { weekday: number, opens: string, closes: string }[], from: string, to: string): number {
  if (hours.length === 0) return 0

  let minutes = 0
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const [year, month, date] = day.split('-').map(Number)
    minutes += minutesOpen(hours, londonWeekday(fromLondonWallClock(year!, month!, date!, 12)))
  }
  return Math.round((minutes / 60) * 10) / 10
}

const hours = (seconds: number): number => Math.round((seconds / 3600) * 10) / 10

export async function utilisation(by: Breakdown, from: string, to: string): Promise<UtilisationRow[]> {
  const { fromAt, toAt } = boundsOf(from, to)
  const counted = await countHours(by, fromAt, toAt)
  const rooms = by === 'room' ? await listRooms(true) : []

  return counted
    .map(row => ({
      key: row.key,
      label: row.label,
      confirmedHours: hours(row.confirmedSeconds),
      cancelledHours: hours(row.cancelledSeconds),
      noShowHours: hours(row.noShowSeconds),
      openHours: by === 'room'
        ? openHoursFor(rooms.find(one => one.id === row.key)?.hours ?? [], from, to)
        : 0,
      bookings: row.bookings,
    }))
    .sort((a, b) => b.confirmedHours - a.confirmedHours)
}
