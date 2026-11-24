// The words a plan and an entry move through (spec part 3), shared by the server and the screens.
export const PLAN_STATES = ['planning', 'published', 'closed'] as const
export const ENTRY_SOURCES = ['call', 'manual', 'companies', 'import'] as const
export const ENTRY_KINDS = ['own', 'visiting', 'hire', 'event'] as const
export const ENTRY_STATES = ['candidate', 'accepted', 'declined', 'withdrawn'] as const
export const ENTRY_SHAPES = ['timed', 'drop-in'] as const
export const RIGHTS = ['none-needed', 'needed', 'held-by-company', 'unknown'] as const
export const WITHDRAWN_REASONS = ['applicant', 'staff', 'production-cancelled', 'retention'] as const

export type PlanState = typeof PLAN_STATES[number]
export type EntryKind = typeof ENTRY_KINDS[number]
export type EntryState = typeof ENTRY_STATES[number]

// The entry columns' bounds (part 2), checked by the routes before the table's own checks.
export const ENTRY_LIMITS = { title: 200, minutes: 1440, getInOut: 720, wanted: 60, note: 2000 } // not-policy: the columns' bounds
