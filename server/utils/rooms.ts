import { asc, eq, inArray } from 'drizzle-orm'
import { roomHoursForm } from '#shared/utils/rooms'
import type { RoomHours, RoomInput } from '#shared/utils/rooms'
import type { EstatePolicy } from '#shared/utils/booking-policy'
import type { H3Event } from 'h3'

// Reading and writing the bookable estate. A room's opening hours are replaced wholesale rather
// than patched: seven days is a small enough set that a diff would be more code than value.

export interface RoomRow {
  id: string
  name: string
  description: string | null
  capacity: number | null
  isActive: boolean
  sensitive: boolean
  campus: string | null
  building: string | null
  contact: string | null
  // Null falls back to the estate setting (C-106 criterion 1).
  minBookingMinutes: number | null
  maxBookingHours: number | null
  noticeHours: number | null
  horizonWeeks: number | null
  activeBookingsCap: number | null
  hours: RoomHours[]
}

const COLUMNS = {
  id: schema.rooms.id,
  name: schema.rooms.name,
  description: schema.rooms.description,
  capacity: schema.rooms.capacity,
  isActive: schema.rooms.isActive,
  sensitive: schema.rooms.sensitive,
  campus: schema.rooms.campus,
  building: schema.rooms.building,
  contact: schema.rooms.contact,
  minBookingMinutes: schema.rooms.minBookingMinutes,
  maxBookingHours: schema.rooms.maxBookingHours,
  noticeHours: schema.rooms.noticeHours,
  horizonWeeks: schema.rooms.horizonWeeks,
  activeBookingsCap: schema.rooms.activeBookingsCap,
}

const HOUR_COLUMNS = {
  roomId: schema.roomHours.roomId,
  weekday: schema.roomHours.weekday,
  opens: schema.roomHours.opens,
  closes: schema.roomHours.closes,
}

function collect(rows: { roomId: string, weekday: number, opens: string, closes: string }[]): Map<string, RoomHours[]> {
  const found = new Map<string, RoomHours[]>()
  for (const row of rows) {
    const day = { weekday: row.weekday, opens: row.opens, closes: row.closes }
    found.set(row.roomId, [...(found.get(row.roomId) ?? []), day])
  }
  return found
}

export async function listRooms(includeInactive: boolean): Promise<RoomRow[]> {
  const wanted = includeInactive ? undefined : eq(schema.rooms.isActive, true)

  const rows = await db.select(COLUMNS).from(schema.rooms).where(wanted).orderBy(asc(schema.rooms.name))

  // Scoped by subquery on the same predicate, never by an IN list built from the rows above
  // (0003, 0006): the parameter count must not grow with the number of rooms.
  const hours = collect(await db.select(HOUR_COLUMNS)
    .from(schema.roomHours)
    .where(inArray(
      schema.roomHours.roomId,
      db.select({ id: schema.rooms.id }).from(schema.rooms).where(wanted),
    ))
    .orderBy(asc(schema.roomHours.weekday), asc(schema.roomHours.opens)))

  return rows.map(row => ({ ...row, hours: hours.get(row.id) ?? [] }))
}

export async function findRoom(id: string): Promise<RoomRow | undefined> {
  const [row] = await db.select(COLUMNS).from(schema.rooms).where(eq(schema.rooms.id, id)).limit(1)
  if (!row) return undefined

  const hours = collect(await db.select(HOUR_COLUMNS)
    .from(schema.roomHours)
    .where(eq(schema.roomHours.roomId, id))
    .orderBy(asc(schema.roomHours.weekday), asc(schema.roomHours.opens)))

  return { ...row, hours: hours.get(row.id) ?? [] }
}

// The diff criterion 1 asks for: what changed, from what, to what. Nothing here is personal.
export function roomChanges(before: RoomRow, after: RoomInput): Record<string, [unknown, unknown]> {
  const changes: Record<string, [unknown, unknown]> = {}
  for (const field of ['name', 'description', 'capacity', 'isActive', 'sensitive', 'campus', 'building', 'contact', 'minBookingMinutes', 'maxBookingHours', 'noticeHours', 'horizonWeeks', 'activeBookingsCap'] as const) {
    if (before[field] !== after[field]) changes[field] = [before[field], after[field]]
  }
  return changes
}

export function parseHours(input: unknown[]): RoomHours[] {
  return input.map(day => roomHoursForm.parse(day))
}

// The estate's own numbers, before any room overrides them. One read of the config set, because
// overrides are memoised per request (0012).
export async function estatePolicy(event: H3Event): Promise<EstatePolicy> {
  return {
    minBookingMinutes: await configValue(event, 'ROOM_MIN_BOOKING_MINUTES'),
    maxBookingHours: await configValue(event, 'ROOM_MAX_BOOKING_HOURS'),
    noticeHours: await configValue(event, 'ROOM_AUTO_APPROVE_NOTICE_HOURS'),
    horizonWeeks: await configValue(event, 'ROOM_BOOKING_HORIZON_WEEKS'),
    activeBookingsCap: await configValue(event, 'ROOM_ACTIVE_BOOKINGS_PER_MEMBER'),
    maxBookingAdminsExempt: await configValue(event, 'ROOM_MAX_BOOKING_ADMINS_EXEMPT'),
  }
}
