import { worksTonight } from './night-authority'
import type { Viewer } from './abilities'

// Every fact a viewer is judged by, read once for the session and the ability resolver alike, so
// a fact added to one can never be missing from the other (0009, 0094).
export interface ViewerFacts extends Viewer {
  // A role may carry no permission at all; the docs tree still counts it as committee (0093).
  holdsRole: boolean
}

// What the session answers: every fact but the id, which rides in `user`, and what follows from
// them. The one fact every screen reads, whether Tonight is offered, is worked out here (0094).
export function sessionFacts(facts: ViewerFacts) {
  const { id: _, ...shared } = facts
  return { ...shared, canWorkTonight: worksTonight(facts) }
}

export type SessionFacts = ReturnType<typeof sessionFacts>

// A signed-out snapshot, typed from the answer, so a fact added there must be given a value here.
export const NO_SESSION_FACTS: SessionFacts = {
  permissions: [],
  holdsRole: false,
  onShiftTonight: false,
  canWorkTonight: false,
  leadsDepartment: false,
  isTrainer: false,
  keepsBarTab: false,
  membershipState: { kind: 'none' },
}

// The chrome's viewer, rebuilt from the session answer: the same shape the server resolver holds,
// read from the account snapshot rather than the cookie (0007, 0009).
export function viewerFromSession(id: string, facts: SessionFacts): Viewer {
  const { holdsRole: _, canWorkTonight: __, ...viewer } = facts
  return { id, ...viewer }
}
