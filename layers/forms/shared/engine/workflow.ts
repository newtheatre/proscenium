// A form's stages (part 3, "Workflow rules"): where a response starts, which moves are open from
// where it is and to whom, and which stages end its journey. The server decides every move with
// these; the screens use the same functions to offer only what the server will allow.
import type { Criterion, Definition, Mover, Review, Stage, StageKind, Transition, Vote, Workflow } from './types'

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
/** A move to an approved or a declined stage is a decision (FB-407): it needs the ability to decide. */
export function isDecision(def: Definition, move: Transition): boolean {
  const kind = stageOf(def, move.to)?.kind
  return move.who === 'staff' && (kind === 'approved' || kind === 'declined')
}

export interface Tally { for: number, against: number, abstain: number, voted: number, quorum: number, quorate: boolean, passed: boolean }
/**
 * Counts a vote. The pass mark is a share of the votes cast, for and against; an abstention is not
 * a vote cast but does count towards the least number who must vote. A vote that is not quorate has
 * not passed, and nor has one with nothing cast.
 */
export function tally(review: Pick<Review, 'pass' | 'quorum'>, votes: readonly Vote[]): Tally {
  const count = (v: Vote) => votes.filter(x => x === v).length
  const yes = count('for')
  const no = count('against')
  const quorum = review.quorum ?? 1
  const quorate = votes.length >= quorum
  const cast = yes + no
  const enough = review.pass === 'unanimous' ? no === 0 : review.pass === 'two-thirds' ? yes * 3 >= cast * 2 : yes * 2 > cast // not-policy: the fractions two thirds and a half
  return { for: yes, against: no, abstain: count('abstain'), voted: votes.length, quorum, quorate, passed: quorate && yes > 0 && enough }
}

export interface ScoreLine { id: string, label: string, max: number, weight: number, count: number, mean: number | null, low: number | null, high: number | null }
export interface ScoreSummary { reviews: number, criteria: ScoreLine[], total: number | null, outOf: number }
/** The summary of a scored round: per criterion the mean and the spread, and the weighted total of the means. */
export function summarise(criteria: readonly Criterion[], reviews: readonly Record<string, number>[]): ScoreSummary {
  const lines = criteria.map((c) => {
    const marks = reviews.map(r => r[c.id]).filter((n): n is number => typeof n === 'number')
    const mean = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null
    return { id: c.id, label: c.label, max: c.max, weight: c.weight ?? 1, count: marks.length, mean, low: marks.length ? Math.min(...marks) : null, high: marks.length ? Math.max(...marks) : null }
  })
  const scored = lines.filter(l => l.mean !== null)
  return {
    reviews: reviews.length,
    criteria: lines,
    total: scored.length ? scored.reduce((sum, l) => sum + l.mean! * l.weight, 0) : null,
    outOf: lines.reduce((sum, l) => sum + l.max * l.weight, 0),
  }
}

/** Whether one reviewer's marks answer every criterion within its range. */
export function validScores(criteria: readonly Criterion[], scores: Record<string, unknown>): boolean {
  return criteria.every((c) => {
    const n = scores[c.id]
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= c.max
  }) && Object.keys(scores).every(id => criteria.some(c => c.id === id))
}

/** What the person who sent a response is told its status is. */
export const statusOf = (stage: Stage | undefined): string => stage ? stage.status?.trim() || stage.name : ''

/** The moves staff see: a decision only for somebody who may decide. */
export const staffMoves = (def: Definition, stage: string | null | undefined, mayDecide: boolean): Transition[] =>
  movesFrom(def, stage, 'staff').filter(t => mayDecide || !isDecision(def, t))

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

/** A definition as the person answering is sent it: without the stages, which name reviewers and how they mark. */
export function withoutWorkflow(def: Definition): Definition {
  const { workflow: _workflow, ...rest } = def
  return rest
}
