// Contract for availability.group (spec part 4): a kind of group whose members can be planned for,
// such as a production's team or a rehearsal unit. Each contribution owns one id prefix.
import type { SQL } from 'drizzle-orm'

export interface AvailabilityGroup {
  /** The ids this contribution answers for start with it, such as `productions.team:`. */
  prefix: string
  /** Groups the viewer may plan for, for the picker. */
  list: (viewerId: string) => Promise<{ id: string, label: string, hint?: string }[]>
  /** A subquery of current member account ids, never a list built from a result set (0006). */
  members: (groupId: string) => SQL
  canPlan: (viewerId: string, groupId: string) => Promise<boolean>
  /**
   * The person's groups of this kind, for sharing reasons (A7) and "Who can see my availability" (S6),
   * each with who plans for it in words, such as "The director and stage managers".
   */
  groupsOf: (accountId: string) => Promise<{ id: string, label: string, plannedBy?: string }[]>
}
