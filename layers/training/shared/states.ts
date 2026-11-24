// The words training is made of (docs/specs/training-records part 2 and docs/specs/training part 2),
// shared by the server and the screens.

export const COURSE_STATES = ['unpublished', 'live', 'retired'] as const
export type CourseState = typeof COURSE_STATES[number]

export const VERSION_STATES = ['in-preparation', 'live', 'replaced'] as const
export type VersionState = typeof VERSION_STATES[number]
export const CHANGE_KINDS = ['records-stand', 'retraining-required'] as const
export type ChangeKind = typeof CHANGE_KINDS[number]

export const STEP_KINDS = ['session', 'practical', 'activity', 'reading', 'lesson', 'quiz', 'certificate', 'declaration'] as const
export type StepKind = typeof STEP_KINDS[number]
export const NEEDED_FOR = ['first', 'renewal', 'both'] as const
export type NeededFor = typeof NEEDED_FOR[number]
export const EVIDENCE_EXPIRY = ['required', 'optional', 'none'] as const
export const EVIDENCE_FILE = ['required', 'optional', 'forbidden'] as const
export const SHOW_ANSWERS = ['never', 'after-pass', 'after-each'] as const

/** Ways to learn, derived from the live version's step kinds (rule W1). */
export const WAYS = ['in-person', 'on-shift', 'online', 'from-outside'] as const
export type Way = typeof WAYS[number]
const WAY_OF: Record<StepKind, Way> = {
  session: 'in-person',
  practical: 'in-person',
  activity: 'on-shift',
  reading: 'online',
  lesson: 'online',
  quiz: 'online',
  certificate: 'from-outside',
  declaration: 'from-outside',
}
export const waysToLearn = (kinds: readonly StepKind[]): Way[] => WAYS.filter(way => kinds.some(kind => WAY_OF[kind] === way))

export const COMPETENCY_STATES = ['active', 'retired'] as const
export const ROUTE_STATES = ['active', 'retired'] as const
export const ROUTE_ITEM_KINDS = ['course', 'recognised'] as const

export const SECTION_KINDS = ['content', 'practice'] as const
export const ATTEMPT_KINDS = ['attempt', 'allowance'] as const
export const VIDEO_STATES = ['uploading', 'processing', 'ready', 'failed', 'deleted'] as const

export const SESSION_STATES = ['unpublished', 'published', 'cancelled', 'completed'] as const
export const SIGN_UP = ['open', 'invited'] as const
export const PLACE_STATES = ['booked', 'waiting', 'cancelled', 'attended', 'absent'] as const
export const CANCEL_KINDS = ['self', 'staff', 'session-cancelled', 'merge'] as const

export const SIGN_OFF_KINDS = ['trainer', 'attendance', 'self', 'lesson', 'quiz', 'activity', 'evidence', 'void'] as const
export type SignOffKind = typeof SIGN_OFF_KINDS[number]
/** The sign-off kind each step kind is met by (amended part 3, "Steps and what signs each off"). */
export const SIGNED_BY: Record<StepKind, SignOffKind> = {
  session: 'attendance',
  practical: 'trainer',
  activity: 'activity',
  reading: 'self',
  lesson: 'lesson',
  quiz: 'quiz',
  certificate: 'evidence',
  declaration: 'evidence',
}
/** Step kinds that may need the thing done more than once. */
export const REPEATABLE: readonly StepKind[] = ['practical', 'activity']

export const RECORD_STATES = ['awarded', 'superseded', 'revoked'] as const
export type RecordState = typeof RECORD_STATES[number]
export const RECORD_ORIGINS = ['steps', 'direct', 'import'] as const
export const REVOKE_CODES = ['entered-in-error', 'no-longer-competent', 'left', 'other'] as const
export type RevokeCode = typeof REVOKE_CODES[number]

export const EVIDENCE_KINDS = ['certificate', 'declaration'] as const
export const EVIDENCE_STATES = ['submitted', 'verified', 'rejected', 'withdrawn'] as const

/** What a reader concludes about a training record at an instant (rules L1 to L4). Lapsed is never stored. */
export type Standing = 'current' | 'expiring' | 'lapsed' | 'superseded' | 'revoked'
export function standingOf(row: { status: RecordState, expiresAt: number | null }, at: number, warnBeforeMs: number): Standing {
  if (row.status !== 'awarded') return row.status
  if (row.expiresAt !== null && row.expiresAt < at) return 'lapsed'
  if (row.expiresAt !== null && row.expiresAt - warnBeforeMs <= at) return 'expiring'
  return 'current'
}
