// Contract for core.change-impact: what a proposed change to a public record would touch, in plain
// words, shown on the confirmation before it is made. Each contribution returns its own lines.
import type { Actor } from '#kit'

export interface ProposedChange {
  /** The record that changes, such as ['core.performance', 'perf_…']. */
  record: { type: string, id: string }
  /** 'space.managed' is a space changing whether the theatre runs it (R-36): impact only, never guarded. */
  kind: 'cancel' | 'reschedule' | 'move' | 'capacity' | 'space.managed'
  /** The new values, for a reschedule, a move, a capacity change or a space's managed. */
  to?: { startsAt?: number, endsAt?: number, venueId?: string, spaceId?: string, capacity?: number | null, managed?: boolean }
}

export interface ChangeImpact {
  impact: (change: ProposedChange, actor: Actor) => Promise<string[]>
}
