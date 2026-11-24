// The form definition and what the engine makes of it. A definition is data, never code: one JSON
// document per form version (form builder specification, part 2). Nothing in this folder imports
// from the platform, so the same files run in the browser and in the Worker (FB-106).

/** The definition format this engine writes. Older formats are read through `upgradeDefinition`. */
export const FORMAT = 1

export const QUESTION_TYPES = [
  'text.short', 'text.long', 'email', 'phone', 'url',
  'number', 'money', 'date', 'time', 'datetime',
  'choice.single', 'choice.multiple', 'choice.dropdown', 'choice.ranking',
  'yesno', 'rating', 'scale', 'address', 'file', 'consent', 'record',
] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

/** The option id an "Other" answer uses. Its text is the answer held under `otherKey(questionId)`. */
export const OTHER = 'other'
export const otherKey = (questionId: string): string => `${questionId}:other`

export const DATA_CLASSES = ['public', 'internal', 'personal', 'free-text', 'special'] as const
export type DataClass = (typeof DATA_CLASSES)[number]

export interface Option { id: string, label: string }

export type Literal = string | number | boolean
/** One side of a comparison, or a leaf of a calculation. */
export type Operand
  = | { answer: string }
    | { calculation: string }
    | { fact: string }
    | { attribute: string }
    | { today: true }
    | { option: string }
    | { value: Literal }
    | { marking: MarkingOperand }

/** What a marked response came to, for a system move's condition (FB-514): its score, its share of the total, and whether it passed. */
export const MARKING_OPERANDS = ['score', 'percent', 'passed'] as const
export type MarkingOperand = typeof MARKING_OPERANDS[number]

export const OPERATORS = [
  'is', 'is-not', 'any-of', 'contains', 'not-contains', 'starts-with',
  'more-than', 'at-least', 'less-than', 'at-most', 'between',
  'before', 'after', 'on-or-before', 'on-or-after', 'within-days',
  'includes', 'not-includes', 'includes-any', 'includes-all', 'count-at-least',
  'answered', 'empty',
] as const
export type Operator = (typeof OPERATORS)[number]

export interface Comparison {
  left: Operand
  op: Operator
  /** One operand, or several for `any-of`, `between`, `includes-any` and `includes-all`. */
  right?: Operand | Operand[]
  /** For `within-days`: how many days either side of `right`. */
  days?: number
}
export type Condition = { all: Condition[] } | { any: Condition[] } | { none: Condition[] } | Comparison

export const RULES = [
  'minLength', 'maxLength', 'min', 'max', 'whole', 'minDate', 'maxDate',
  'minChosen', 'maxChosen', 'pattern', 'regex', 'fileTypes', 'maxFileSize', 'maxFiles',
] as const
export type RuleName = (typeof RULES)[number]
/** Patterns an author may pick by name. A free `regex` is a separate rule a setting allows. */
export const PATTERNS = { 'letters': /^[\p{L}\s'-]+$/u, 'digits': /^\d+$/, 'letters-and-digits': /^[\p{L}\d]+$/u, 'postcode-uk': /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i } as const
export type PatternName = keyof typeof PATTERNS

export interface Rule {
  rule: RuleName
  /** A number, a date, a pattern name, a list of file types, or `{ today: n }` for n days from today. */
  value?: string | number | string[] | { today: number }
  /** The theatre's own words when the rule fails. Without it the platform's default is shown. */
  message?: string
}

export interface Question {
  kind: 'question'
  id: string
  /** The readable name used in exports. Unique within a form. */
  key: string
  type: QuestionType
  label: string
  help?: string
  /** `choice.*`: the options. Each id is unique within its question and never reused. */
  options?: Option[]
  /** `choice.single`, `choice.multiple`, `choice.dropdown`: also offer "Other" with a text answer. */
  allowOther?: boolean
  /** `record`: where its answers are chosen from, such as `core.person`. Sources are contributed by modules. */
  source?: string
  /** `record`, `choice.dropdown`: more than one may be chosen. */
  multiple?: boolean
  /** `rating`: the top of the scale (bottom is 1). `scale`: both ends, with optional labels. */
  scale?: { min?: number, max: number, minLabel?: string, maxLabel?: string }
  required?: boolean | Condition
  visibleWhen?: Condition
  validation?: Rule[]
  dataClass: DataClass
  /** A `record` question of people who are involved: a reviewer named in it is locked out (FB-406). */
  peopleInvolved?: boolean
  /** A `record` question anybody signed in may search while answering, whatever they may search elsewhere. The author's choice. */
  openSearch?: boolean
  /** The correct answer, on a question that can be marked (FB-513). Never sent to anybody answering. */
  answer?: AnswerKey
}
/** A repeating group: the questions are answered once per entry. */
export interface Group {
  kind: 'group'
  id: string
  key: string
  label: string
  help?: string
  min?: number
  max?: number
  visibleWhen?: Condition
  items: Question[]
}
/** Two questions side by side at laptop width. */
export interface Row { kind: 'row', id: string, items: [Question, Question] }
export interface Content { kind: 'content', id: string, text: string, visibleWhen?: Condition }
export type Item = Question | Group | Row | Content

export type RouteTarget = { page: string } | { ending: string }
export interface Route { when: Condition, to: RouteTarget }
export interface Page {
  id: string
  title: string
  help?: string
  visibleWhen?: Condition
  items: Item[]
  /** In order; the first whose condition holds is taken. With none, the next page. */
  routes?: Route[]
}

export const FUNCTIONS = ['add', 'subtract', 'multiply', 'divide', 'round', 'min', 'max', 'days-between', 'add-days', 'join'] as const
export type FunctionName = (typeof FUNCTIONS)[number]
export type Expression
  = | Operand
    | { fn: FunctionName, args: Expression[], places?: number }
    | { fn: 'sum', group: string, of: string }
    | { fn: 'count', group: string }
    | { fn: 'choose', when: Condition, then: Expression, else: Expression }
/**
 * What a calculation's value is, and so how it reads: a number, money in whole minor units of the
 * theatre's currency, a share shown as a percentage (0.25 reads as 25%), a date, or text.
 */
export const CALCULATION_TYPES = ['number', 'money', 'percent', 'date', 'text'] as const
export type CalculationType = (typeof CALCULATION_TYPES)[number]
export interface Calculation {
  id: string
  /** The readable name used in exports. Unique within a form, with the questions' keys. */
  key: string
  type: CalculationType
  expression: Expression
  /** What it is called where people read it: on its page, beside the answers, in the table. The key stands in without one. */
  label?: string
  /** The page it is shown on, as a read-only line after that page's questions. Without one, nobody answering sees it. */
  page?: string
}

/** A closing screen. One that does not submit stores nothing and shows its message. */
export interface Ending { id: string, title: string, message?: string, submits: boolean }

// ---- stages (part 3, "Workflow rules") ----

export const STAGE_KINDS = ['pending', 'in_review', 'returned', 'approved', 'declined', 'closed'] as const
export type StageKind = typeof STAGE_KINDS[number]
/** Who may make a move: staff who may move this form's responses, the person who sent the response, or the system when its condition holds (FB-514). */
export const MOVERS = ['staff', 'submitter', 'system'] as const
export type Mover = typeof MOVERS[number]
export interface Stage {
  key: string
  name: string
  kind: StageKind
  /** Asks for review of each response that arrives. Only on a stage of the kind in_review. */
  review?: Review
  /** What the person who sent the response is told its status is; the stage's name when left out. */
  status?: string
}
/**
 * Something another module does when a response takes a move (forms.outcome-action), such as
 * issuing the award a nomination was for. `map` says which question's answer fills each thing the
 * action asks for.
 */
export interface ActionUse { id: string, action: string, map: Record<string, string> }
export interface Transition {
  key: string
  from: string
  to: string
  label: string
  who: Mover
  /** A move to an approved or declined stage is a decision; this one cannot be made without a reason for the record. */
  needsReason?: boolean
  /** What other modules do once a response has taken this move. Each runs once. */
  actions?: ActionUse[]
  /** A system move's condition (AT1): required on one, refused on any other. */
  when?: Condition
}

// ---- review (part 3, "Review rules"; change 1: a vote is a second kind of review) ----
export const REVIEW_MODES = ['scores', 'vote'] as const
export type ReviewMode = typeof REVIEW_MODES[number]
export const PASS_MARKS = ['majority', 'two-thirds', 'unanimous'] as const
export type PassMark = typeof PASS_MARKS[number]
export const VOTES = ['for', 'against', 'abstain'] as const
export type Vote = typeof VOTES[number]
export interface Criterion { id: string, label: string, max: number, weight?: number }
/** Who reviews, and how, the responses that reach a stage. */
export interface Review {
  mode: ReviewMode
  /** The holders of a role, named people, or both. */
  reviewers: { role?: string, people?: string[] }
  /** Scores: what each reviewer marks, each from nought to its most. */
  criteria?: Criterion[]
  /** A vote: the share of the votes cast, for and against, that must be for. */
  pass?: PassMark
  /** A vote: the least number who must vote, abstentions included. */
  quorum?: number
  /** Reviewers see each other's reviews from the start. */
  open?: boolean
  /** A vote: nobody ever sees who voted which way, only the tally. */
  secret?: boolean
}
/** A form's stages. A response starts in the first. A form with none has one stage, Received, which is closed. */
export interface Workflow { stages: Stage[], transitions: Transition[] }

// ---- marking (FB-513) ----

/** The question types that can carry a correct answer. A choice is marked by its option ids; short text by the accepted texts. */
export const MARKABLE_TYPES = ['choice.single', 'choice.multiple', 'choice.dropdown', 'yesno', 'number', 'text.short'] as const satisfies readonly QuestionType[]
export const MARKING_SHOWS = ['score', 'score-and-feedback', 'score-feedback-and-answers'] as const
export type MarkingShow = (typeof MARKING_SHOWS)[number]
/**
 * What is right: option ids (choice), true or false (yes or no), a range inclusive (number), or the
 * accepted texts (short text), compared without regard to case or the spaces round them.
 */
export type Correct = string[] | boolean | { min?: number, max?: number }
export interface AnswerKey {
  correct: Correct
  /** Whole points for getting it right, 0 to 100; 1 when left out. */
  points?: number
  feedback?: { right?: string, wrong?: string }
}
export interface Marking {
  /** The least score that passes, in whole points. Without one, nobody passes or fails. */
  passMark?: number
  /** What the person is told once they have sent their answers. */
  show: MarkingShow
}

export interface Definition {
  format: number
  pages: Page[]
  calculations?: Calculation[]
  endings?: Ending[]
  workflow?: Workflow
  /** Answers are marked against their questions' correct answers. Present on a quiz. */
  marking?: Marking
  presentation?: { introduction?: string, submitLabel?: string, confirmation?: string, progress?: boolean }
}

// ---- answers and results ----

export interface Address { line1: string, line2?: string, town: string, county?: string, postcode: string, country?: string }
export interface FileRef { id: string, name: string, size: number, type: string }
export type Value = string | number | boolean | string[] | Address | FileRef[] | null | undefined
/** A repeating group's answer: one object per entry, keyed by question id. */
export type Entry = Record<string, Value>
/** Answers by question id; a group's by group id; an "Other" answer's text by `otherKey(id)`. */
export type Answers = Record<string, Value | Entry[]>

export interface Context {
  /** The operating day in the theatre's time zone, `YYYY-MM-DD`. The engine never reads a clock. */
  today: string
  /** Facts about the respondent, resolved by the server. The browser is sent them, never asked. */
  facts?: Record<string, Literal | null>
  /** Attributes of the record the form is attached to. */
  attributes?: Record<string, Literal | null>
  /** What the response scored, on the server only, for a system move's condition. */
  marking?: { score: number, outOf: number, passed: boolean | null } | null
}

/** Why an answer is refused. `message` is the theatre's own wording where the rule carries one. */
export interface Issue { rule: RuleName | 'required' | 'type' | 'option' | 'other' | 'minEntries' | 'maxEntries', message?: string, params?: Record<string, string | number> }

export interface Evaluation {
  /** Every page, group, row, content and question by path. A question inside a group is `<group>.<entry>.<question>`. */
  visible: Record<string, boolean>
  required: Record<string, boolean>
  /** Only paths with something wrong. */
  issues: Record<string, Issue[]>
  calculated: Record<string, string | number | null>
  /** The pages the respondent passes through with these answers, in order. */
  route: string[]
  /** Where the route ends: an ending, or `null` for plain submission after the last page. */
  ending: Ending | null
  /** The answers with every hidden one removed. This, and nothing sent by the browser, is what is stored. */
  answers: Answers
  valid: boolean
}

export interface Limits { questions: number, pages: number, definitionBytes: number, repeatEntries: number, conditionDepth: number }
export const DEFAULT_LIMITS: Limits = { questions: 200, pages: 30, definitionBytes: 256 * 1024, repeatEntries: 20, conditionDepth: 3 }
