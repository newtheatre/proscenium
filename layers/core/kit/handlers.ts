// The shapes of the handler files a manifest names. Each file's default export is one of these.
import type { UnitView } from './unit'
import type { Actor } from './context'

export interface EventRow { id: string, name: string, recordType: string | null, recordId: string | null, payload: Record<string, unknown>, announcedAt: number }
export interface JobInfo {
  id: string
  name: string
  attempts: number
  /** How many times this job has answered "not yet". */
  deferrals: number
  /**
   * Answers "not yet": the unit still commits, then the job is queued again after a pause that
   * grows with each deferral (core.jobs.backoff doubled, at most twelve hours). A deferral is not a
   * failed attempt and never makes the job dead. `reason` is a code, kept as the job's last note.
   */
  defer: (reason: string) => void
}

export type Listener = (event: EventRow, unit: UnitView) => Promise<void> | void
export type JobHandler<P = any> = (payload: P, unit: UnitView, job: JobInfo) => Promise<void> | void
export type TaskHandler = (unit: UnitView, run: { dueAt: number }) => Promise<void> | void
export type FactResolver = ((actor: Actor, record?: { type: string, id: string }) => Promise<boolean | { holds: boolean, until?: number }> | boolean) & {
  /**
   * The accounts that hold the fact now, for one record or for any. Async and pure, never queued.
   * A fact without it cannot be enumerated, and identity's holdersOf says so.
   */
  holders?: (record?: { type: string, id: string }) => Promise<string[]>
}

export interface CallOutcome { result: 'succeeded' | 'failed', providerReference?: string, data?: Record<string, unknown> }
export interface CallAttempt { id: string, name: string, reference: string, idempotencyKey: string, at: number }
export interface CallHandler {
  /** Applies a known outcome to the module's records, in the outcome's unit of work. */
  outcome: (unit: UnitView, outcome: CallOutcome, attempt: CallAttempt) => Promise<void> | void
  /** Asks the provider what happened to an attempt with no outcome. 'unknown' tries again later. */
  reconcile: (attempt: CallAttempt) => Promise<CallOutcome | 'unknown'>
}

export const defineListener = (fn: Listener): Listener => fn
export const defineJob = <P = any>(fn: JobHandler<P>): JobHandler<P> => fn
export const defineTask = (fn: TaskHandler): TaskHandler => fn
export const defineFact = (fn: FactResolver, options: { holders?: FactResolver['holders'] } = {}): FactResolver =>
  options.holders ? Object.assign(fn, { holders: options.holders }) : fn
export const defineCall = (handler: CallHandler): CallHandler => handler

export interface ModuleHandlers {
  listeners?: Record<string, Listener>
  jobs?: Record<string, JobHandler>
  tasks?: Record<string, TaskHandler>
  facts?: Record<string, FactResolver>
  calls?: Record<string, CallHandler>
  /** Code contributions: point name, then file name, to the module's export. */
  contributions?: Record<string, Record<string, unknown>>
}
