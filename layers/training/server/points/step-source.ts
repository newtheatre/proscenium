// Contract for training.step-source: another module's activity that signs off an activity step, such
// as Front of house's shadowed shift (Training specification, amended part 4, H1 to H4; part 5, "The
// point training.step-source"). Training never reads the contributor's tables: it asks for confirmed
// occurrences and writes one `activity` sign-off for each, once per course.
import type { ZodType } from 'zod'

/** One confirmed occurrence of the activity. */
export interface StepOccurrence {
  accountId: string
  /** The contributor's own id for it, at most 64 characters; kept on the sign-off as its source_ref. */
  occurrenceId: string
  /** The theatre-local day it happened, YYYY-MM-DD. */
  on: string
  /** Who confirmed it. One confirmed by the person themself never counts (H3). */
  confirmedBy: string
}

export interface StepSource {
  /** Translation key for the source's name, such as "Shadowed shift". */
  label: string
  /** What a course author picks, such as `{ dutyId }`; stored on the step as source_params. */
  params: ZodType<Record<string, unknown>>
  /** The name of the course editor's picker component for the parameters, if the source has one. */
  picker?: string
  /** A label for stored parameters, such as "Shadowed shift as Duty manager". */
  describe: (params: Record<string, unknown>) => Promise<string>
  /**
   * Confirmed occurrences for these accounts on or after `since` (a theatre-local day), in one
   * bounded query. Unconfirmed ones are left out.
   */
  occurrences: (accountIds: string[], params: Record<string, unknown>, since: string) => Promise<StepOccurrence[]>
  /** The event announced when an occurrence is confirmed; its payload carries `accountId`. */
  event: string
  /** What a course author needs to see the picker's choices. */
  ability?: string
}
