import { asc, eq, inArray } from 'drizzle-orm'
import { roomHoursForm } from '#shared/utils/rooms'
import type { RoomHours, RoomInput } from '#shared/utils/rooms'

// Reading and writing the bookable estate. A room's opening hours are replaced wholesale rather
// than patched: seven days is a small enough set that a diff would be more code than value.

export interface RoomRow {
  id: string
  name: string
  description: string | null
  capacity: number | null
  isActive: boolean
  sensitive: boolean
  isExternal: boolean
  campus: string | null
  building: string | null
  contact: string | null
  hours: RoomHours[]
}

const COLUMNS = {
  id: schema.rooms.id,
  name: schema.rooms.name,
  description: schema.rooms.description,
  capacity: schema.rooms.capacity,
  isActive: schema.rooms.isActive,
  sensitive: schema.rooms.sensitive,
  isExternal: schema.rooms.isExternal,
  campus: schema.rooms.campus,
  building: schema.rooms.building,
  contact: schema.rooms.contact,
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
  for (const field of ['name', 'description', 'capacity', 'isActive', 'sensitive', 'isExternal', 'campus', 'building', 'contact'] as const) {
    if (before[field] !== after[field]) changes[field] = [before[field], after[field]]
  }
  return changes
}

export function parseHours(input: unknown[]): RoomHours[] {
  return input.map(day => roomHoursForm.parse(day))
}
