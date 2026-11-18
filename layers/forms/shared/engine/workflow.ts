// A form's stages (part 3, "Workflow rules"): where a response starts, which moves are open from
// where it is and to whom, and which stages end its journey. The server decides every move with
// these; the screens use the same functions to offer only what the server will allow.
import type { Definition, Mover, Stage, StageKind, Transition, Workflow } from './types'

/** The stage of a form that defines none: a response is received and that is the end of it. */
export const RECEIVED = 'received'
/** The move that puts a new response in its first stage; no transition carries this key. */
export const SUBMIT = 'submit'
const NONE: Workflow = { stages: [{ key: RECEIVED, name: '', kind: 'closed' }], transitions: [] }

export const workflowOf = (def: Definition): Workflow => def.workflow?.stages.length ? def.workflow : NONE
/** Whether the form has stages of its own, and so anything to show about them. */
export const hasStages = (def: Definition): boolean => !!def.workflow?.stages.length
export const firstStage = (def: Definition): Stage => workflowOf(def).stages[0]!
export const stageOf = (def: Definition, key: string | null | undefined): Stage | undefined => workflowOf(def).stages.find(s => s.key === key)
/** A response in a stage of one of these kinds has reached its end, and its retention period runs. */
export const isFinal = (kind: StageKind | string | null | undefined): boolean => kind === 'approved' || kind === 'declined' || kind === 'closed'
/** The moves open from a stage to one kind of mover. */
export const movesFrom = (def: Definition, stage: string | null | undefined, who: Mover): Transition[] => workflowOf(def).transitions.filter(t => t.from === stage && t.who === who)
/** The move a person makes by sending their changes back: the first one open to them from a returned stage. */
export function resubmitMove(def: Definition, stage: string | null | undefined): Transition | undefined {
  return stageOf(def, stage)?.kind === 'returned' ? movesFrom(def, stage, 'submitter')[0] : undefined
}
/** What the person who sent a response is told its status is. */
export const statusOf = (stage: Stage | undefined): string => stage ? stage.status?.trim() || stage.name : ''

/** A starting point for a form that wants review: received, in review, returned for changes, and a decision. */
export function reviewWorkflow(names: { received: string, review: string, returned: string, approved: string, declined: string, start: string, back: string, resubmit: string, approve: string, decline: string }): Workflow {
  return {
    stages: [
      { key: 'received', name: names.received, kind: 'pending' },
      { key: 'in_review', name: names.review, kind: 'in_review' },
      { key: 'returned', name: names.returned, kind: 'returned' },
      { key: 'approved', name: names.approved, kind: 'approved' },
      { key: 'declined', name: names.declined, kind: 'declined' },
    ],
    transitions: [
      { key: 'start_review', from: 'received', to: 'in_review', label: names.start, who: 'staff' },
      { key: 'return', from: 'in_review', to: 'returned', label: names.back, who: 'staff' },
      { key: 'resubmit', from: 'returned', to: 'in_review', label: names.resubmit, who: 'submitter' },
      { key: 'approve', from: 'in_review', to: 'approved', label: names.approve, who: 'staff' },
      { key: 'decline', from: 'in_review', to: 'declined', label: names.decline, who: 'staff' },
    ],
  }
}
