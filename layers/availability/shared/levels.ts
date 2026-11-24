// The words a person's availability is made of (spec parts 2 and 3), shared by the server and screens.

export const LEVELS = ['free', 'maybe', 'busy'] as const
export type Level = typeof LEVELS[number]
/** What `levels()` answers: a stated level, or unknown where nothing is stated (rule A4). */
export type ShownLevel = Level | 'unknown'
export const UNMARKED = ['unknown', 'free'] as const
export type Unmarked = typeof UNMARKED[number]

export const REQUEST_STATES = ['open', 'closed'] as const
export const ASKED_STATES = ['asked', 'answered', 'lapsed', 'withdrawn'] as const
export type AskedState = typeof ASKED_STATES[number]
export const POLL_STATES = ['polling', 'decided', 'abandoned'] as const
export type PollState = typeof POLL_STATES[number]
/** A poll answer (F7): never changes the person's availability. */
export const VOTES = ['yes', 'if-need-be', 'no'] as const
export type Vote = typeof VOTES[number]
export const MEETING_STATES = ['arranged', 'cancelled'] as const
export type MeetingState = typeof MEETING_STATES[number]
export const RESPONSES = ['pending', 'going', 'not-going'] as const
export type Response = typeof RESPONSES[number]
/** Calendar imports (I1 to I5): where a connection reads from, what a tentative event becomes, and its health. */
export const CONNECTION_KINDS = ['ics', 'google', 'microsoft'] as const
export type ConnectionKind = typeof CONNECTION_KINDS[number]
export const TENTATIVE_AS = ['maybe', 'busy', 'ignore'] as const
export type TentativeAs = typeof TENTATIVE_AS[number]
export const CONNECTION_STATES = ['active', 'failing', 'broken'] as const
export type ConnectionState = typeof CONNECTION_STATES[number]
export const IMPORTED_LEVELS = ['busy', 'maybe'] as const
export type ImportedLevel = typeof IMPORTED_LEVELS[number]

const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/

/** Minutes past local midnight of an "HH:MM" wall-clock time, "24:00" allowed as an end. */
export function minutesOf(clock: string): number {
  if (!HHMM.test(clock)) throw new RangeError(`not a time of day: ${clock}`)
  return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5)) // not-policy: minutes in an hour
}

/** Rule A2: a time sits on the grid step. */
export const onStep = (clock: string, step: number) => minutesOf(clock) % step === 0
