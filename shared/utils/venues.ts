import { z } from 'zod'

// A venue is its own row, never a flagged room (0043). `roomId` is a pointer with one effect:
// the venue's performances apply blackouts to that room, and nothing else is inferred either way.

export const MAX_VENUE_NAME = 120
export const MAX_VENUE_ADDRESS = 300
export const MAX_VENUE_DESCRIPTION = 2000

export const venueForm = z.object({
  name: z.string().trim().min(1, 'A venue needs a name').max(MAX_VENUE_NAME),
  address: z.string().trim().max(MAX_VENUE_ADDRESS).nullish(),
  // Null is uncapped: general admission only, no seat map exists (programme.ts).
  capacity: z.number().int('A capacity is a whole number of seats')
    .positive('A venue seats at least 1. To close one performance, set its own capacity to 0').nullish(),
  isExternal: z.boolean().default(false),
  description: z.string().trim().max(MAX_VENUE_DESCRIPTION).nullish(),
  roomId: z.string().trim().min(1, 'Say which room you mean').nullish(),
}).strict()

export const archiveVenueForm = z.object({ archived: z.boolean() }).strict()

export type VenueInput = z.output<typeof venueForm>

// Everything a venue carries, which is what the console reads. `inUse` is counted from the
// tables that reference it, never stored, so it cannot drift from the rows it describes.
export interface AdminVenue {
  id: string
  name: string
  address: string | null
  capacity: number | null
  isExternal: boolean
  imageKey: string | null
  description: string | null
  roomId: string | null
  archived: boolean
  inUse: boolean
  // What "in use" most often means, so the list can say it rather than "has records".
  showCount: number
  performanceCount: number
}

// The list's "In use" cell: the shows and performances when there are any, the rest by name.
export function saysVenueUse(venue: Pick<AdminVenue, 'inUse' | 'showCount' | 'performanceCount'>): string {
  if (!venue.inUse) return 'Nothing yet'
  if (venue.performanceCount === 0) return 'Rota or night records'
  const shows = venue.showCount === 1 ? '1 show' : `${venue.showCount} shows`
  const nights = venue.performanceCount === 1 ? '1 performance' : `${venue.performanceCount} performances`
  return `${shows}, ${nights}`
}
