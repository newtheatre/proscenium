import { z } from 'zod'

// The till's own session (F-102): the one accountable window that every sale, tab charge and comp
// hangs off. One per venue per night, opened once and closed once.

export interface TillSession {
  id: string
  venueId: string
  night: string
  openedBy: string
  openedAt: number
  closedBy: string | null
  closedAt: number | null
}

// Where to open one. Never a night: the till only ever acts on tonight's (F-101 criterion 1), and
// a stale session is addressed by its own id, not asked for by scope.
export const tillScopeForm = z.object({
  venueId: z.string().trim().min(1).optional(),
  performanceId: z.string().trim().min(1).optional(),
})

export type TillScopeInput = z.output<typeof tillScopeForm>

export const closeTillSessionForm = z.object({
  id: z.string().trim().min(1, 'Which session to close'),
})
