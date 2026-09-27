// The one thing a member can do about a module they do not hold, derived wherever it is offered;
// Ask only when no session is open to them (issue 1335, G-102 c6, G-104 criterion 4 as amended).

export interface ActionSession {
  id: string
  heldOn: string
  startsAt: string
  place: string | null
  full: boolean
  // Sign-up is open to this member: not closed, and no missing safety-critical prerequisite.
  open: boolean
  // Null when they have not signed up; otherwise whether their sign-up holds a place.
  placed: boolean | null
  waitlistPosition: number | null
}

export interface SessionRef { id: string, heldOn: string, startsAt: string, place: string | null }

export type TrainingAction
  = | { kind: 'PLACED', session: SessionRef }
    | { kind: 'WAITING', session: SessionRef, position: number }
    | { kind: 'SIGN_UP', session: SessionRef }
    | { kind: 'JOIN_WAITING_LIST', session: SessionRef }
    | { kind: 'ASKED' }
    | { kind: 'ASK' }

const refOf = (session: ActionSession): SessionRef =>
  ({ id: session.id, heldOn: session.heldOn, startsAt: session.startsAt, place: session.place })

// `sessions` are those teaching the module, soonest first. A held place wins over a waiting one on
// an earlier session, then the soonest session open to them, then the ask.
export function trainingAction(sessions: readonly ActionSession[], requested: boolean): TrainingAction {
  const placed = sessions.find(session => session.placed === true)
  if (placed) return { kind: 'PLACED', session: refOf(placed) }
  const waiting = sessions.find(session => session.placed === false)
  if (waiting) return { kind: 'WAITING', session: refOf(waiting), position: waiting.waitlistPosition ?? 0 }
  const open = sessions.find(session => session.open)
  if (open) return { kind: open.full ? 'JOIN_WAITING_LIST' : 'SIGN_UP', session: refOf(open) }
  return requested ? { kind: 'ASKED' } : { kind: 'ASK' }
}

export function saysTrainingAction(action: TrainingAction): string {
  switch (action.kind) {
    case 'PLACED': return 'You have a place'
    case 'WAITING': return `On the waiting list, number ${action.position}`
    case 'SIGN_UP': return 'Sign up'
    case 'JOIN_WAITING_LIST': return 'Join the waiting list'
    case 'ASKED': return 'Asked for'
    case 'ASK': return 'Ask for this module'
    default: return action satisfies never
  }
}
