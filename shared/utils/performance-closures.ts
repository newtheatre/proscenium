import { shiftWindow } from './rota-times'
import type { Blackout } from './blackouts'
import type { PerformanceTimes, ShiftOffsets } from './rota-times'

// A performance closes the room its venue is attached to (0043, issue 1347), over the
// performance's shift window (0078). Derived whenever it is read, never stored or typed in.

export interface PerformanceOnStage extends PerformanceTimes {
  performanceId: string
  roomId: string
  // Null for a show nobody has published, which is nowhere public (D-121).
  showTitle: string | null
}

export interface PerformanceClosure extends Blackout {
  roomId: string
  performanceId: string
}

export interface Overlapping {
  id: string
  title: string
  status: string
  startsAt: number
  endsAt: number
  bookedBy: string | null
}

// The officers' list, which names the show whether or not it is published (rooms.read only).
export interface ListedPerformanceClosure extends PerformanceClosure {
  room: string
  venue: string
  show: string
  published: boolean
  overlapping: Overlapping[]
}

// The house's default offsets rather than any one role's: the room is shut for the evening, not
// for one role's shift in it.
export function performanceClosure(performance: PerformanceOnStage, offsets: ShiftOffsets): PerformanceClosure {
  const window = shiftWindow(performance, offsets)
  return {
    id: `performance:${performance.performanceId}`,
    performanceId: performance.performanceId,
    roomId: performance.roomId,
    reason: `${performance.showTitle ?? 'A performance'} is on`,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
  }
}
