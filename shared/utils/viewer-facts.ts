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
