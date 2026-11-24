// Contract for core.space-busy: the times another module takes a space (a room booking, a training
// session, a pencilled slot), so core, Spaces and the occupancy view see them without reading that
// module's tables. A read for showing and for warnings; a write keeps its own statement predicate.
import type { Actor } from '#kit'

export interface SpaceBusyQuery {
  /** At most 30 spaces, those the reader asked about. */
  spaceIds: string[]
  /** The window, [from, to) in UTC milliseconds. */
  from: number
  to: number
}

export interface SpaceBusyItem {
  spaceId: string
  /** The contributor's own word for it, kebab-case, such as room-booking or pencil. */
  kind: string
  from: number
  to: number
  /** Gives way to a performance: scheduling over it warns rather than refuses. */
  yields: boolean
  record: { type: string, id: string }
  /** What it is, for a reader who may see it; null shows as "Busy" with its times (O2). */
  label: string | null
}

export interface SpaceBusy {
  /** `actor` decides the labels; null (a job, a check before a write) asks for none. */
  busy: (query: SpaceBusyQuery, actor: Actor | null) => Promise<SpaceBusyItem[]>
}
