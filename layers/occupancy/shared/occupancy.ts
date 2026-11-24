// The occupancy view's answer (O1), shared by the service and OccupancyGrid.

/** Core's own kinds; a contributor to core.space-busy adds its own word, such as room-booking. */
export type CoreOccupancyKind = 'performance-scheduled' | 'performance-draft' | 'closure' | 'public-holiday'

export interface OccupancyItem {
  kind: CoreOccupancyKind | (string & {})
  /** The module that reported it: core for performances and closures. */
  module: string
  /** [from, to) in UTC milliseconds. */
  from: number
  to: number
  /** The operating days it starts and ends on, YYYY-MM-DD, so a show ending at 00:30 sits on its night. */
  day: string
  lastDay: string
  /** Gives way to a performance: scheduling over it warns rather than refuses. */
  yields: boolean
  record: { type: string, id: string }
  /** What it is, where the reader may see it; null shows as "Busy" with its times (O2). */
  label: string | null
}

export interface SpaceOccupancy {
  spaceId: string
  /** Soonest first. */
  items: OccupancyItem[]
}

/** O3: the most one call may ask for. */
export const OCCUPANCY_MAX_DAYS = 31 // not-policy: rule O3's fixed bound
export const OCCUPANCY_MAX_SPACES = 30 // not-policy: rule O3's fixed bound
