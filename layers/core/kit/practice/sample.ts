// What a module contributes to practice (Practice mode, part 4): sample sets that write fictional
// records into a store through the module's own services, and the checks that tick a scenario's tasks.
import type { UnitView } from '../unit'

export interface PracticeSampleContext {
  /** The person practising: their real account id, so the store's rows read naturally. */
  accountId: string
  /** Their display name, the one thing about them a store holds. */
  name: string | null
  /** The store's "Practice staff" account, which copied account columns point at. */
  staffId: string
  /** When the session started, in UTC milliseconds. */
  startedAt: number
  /** The named results of the sets that ran before this one, such as `{ tonight: 'prf_...' }`. */
  results: Readonly<Record<string, string>>
}

export interface PracticeSample {
  /** Sample set ids that must run first. */
  after?: readonly string[]
  /** Adds statements to the store's unit; answers named results for scenarios' `start` and later sets. */
  seed: (unit: UnitView, context: PracticeSampleContext) => Promise<Record<string, string> | undefined> | Record<string, string> | undefined
}

/** A scenario's checks, by task id: each reads the module's own tables in the store and answers true once the task is done. */
export type PracticeChecks = Record<string, (context: PracticeSampleContext) => Promise<boolean> | boolean>

export const definePracticeSample = (sample: PracticeSample): PracticeSample => sample
export const definePracticeChecks = (checks: PracticeChecks): PracticeChecks => checks
