import { shiftWindow } from './rota-times'
import type { Blackout } from './blackouts'
import type { PerformanceTimes, ShiftOffsets } from './rota-times'

// A performance closes the room its venue is attached to (0043, issue 1347), over the
// performance's shift window (0078). Derived whenever it is read, never stored or typed in.

export interface PerformanceOnStage extends PerformanceTimes {
  performanceId: string
  roomId: string
  showTitle: string
}

export interface PerformanceClosure extends Blackout {
  roomId: string
  performanceId: string
}

const PREFIX = 'performance:'

// The house's default offsets rather than any one role's: the room is shut for the evening, not
// for one role's shift in it.
export function performanceClosure(performance: PerformanceOnStage, offsets: ShiftOffsets): PerformanceClosure {
  const window = shiftWindow(performance, offsets)
  return {
    id: `${PREFIX}${performance.performanceId}`,
    performanceId: performance.performanceId,
    roomId: performance.roomId,
    reason: `${performance.showTitle} is on`,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
  }
}

// An officer's closure can be reopened; a performance's goes only when the performance does.
export function isPerformanceClosure(blackout: Blackout): blackout is PerformanceClosure {
  return blackout.id.startsWith(PREFIX)
}
