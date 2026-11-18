// Contract for forms.outcome-action: something a module does once a response has taken a move
// (form builder specification, part 4; FB-506), such as issuing the award a nomination was for.
// The form's designer puts the action on a move and says which question's answer fills each thing
// it asks for. Forms runs it in a job after the move has committed, hands it the answers, and
// records that it ran in the same unit of work as whatever the action writes: so everything the
// action adds to the unit happens exactly once. Anything it does outside the unit can repeat, and
// must be keyed by `runId`.
import type { UnitView } from '#kit'
import type { QuestionType, Value } from '../../shared/engine'

export interface ActionInput {
  /** What the action calls this input. Never changes. */
  key: string
  /** The translation key of its name in the builder. */
  label: string
  /** The move cannot be published until a question fills this. */
  required?: boolean
  /** The question types whose answers fit. Any, when left out. */
  types?: QuestionType[]
}

/** One answer handed to an action: as stored, and as the words a person would read. */
export interface ActionAnswer { value: Value, text: string }

export interface ActionCall {
  /** One id per run. The same however many times the job is tried. */
  runId: string
  /** By input key. An input nobody mapped, or whose question was not answered, is left out. A special-category answer is never handed over. */
  input: Record<string, ActionAnswer | undefined>
  response: {
    id: string
    reference: string
    formId: string
    /** The account that sent it; null when they were signed out or the form is anonymous. */
    personId: string | null
    /** The record the response is about, when it was answered in a slot. */
    subjectType: string | null
    subjectId: string | null
    decidedAt: number | null
    decisionReason: string | null
  }
  /** Who made the move; null when it was the person themselves, signed out. */
  actorId: string | null
  /** When the move was made. */
  at: number
}

export interface OutcomeAction {
  /** `<module>.<name>`, such as `awards.issue-award`. Never changes. */
  key: string
  /** The translation key of its name in the builder and on a response. */
  label: string
  /** Runs only for responses answered in this slot; elsewhere it is skipped, and the response says so. */
  slot?: string
  inputs: ActionInput[]
  /** Adds what the action does to the unit. A refusal or a throw leaves the run waiting, and the job tries again. */
  run: (unit: UnitView, call: ActionCall) => Promise<void>
}
