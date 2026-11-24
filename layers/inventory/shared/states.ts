// The words Inventory is made of (spec parts 2 and 3), shared by the server and screens. Every move
// a record may make is listed here; no other exists (rule I7).

export const RECORD_STATES = ['active', 'archived'] as const
export const LENDS_TO = ['productions', 'members', 'anyone'] as const
export type LendsTo = typeof LENDS_TO[number]

export const TRACKING = ['individual', 'counted'] as const
export type Tracking = typeof TRACKING[number]
export const CONDITIONS = ['as-new', 'good', 'worn', 'damaged'] as const
export type Condition = typeof CONDITIONS[number]
export const OWNERSHIP = ['owned', 'hired-in', 'borrowed-in'] as const
export const OUT_OF_SERVICE_REASONS = ['inspection-failed', 'fault', 'by-hand'] as const

export const ITEM_STATES = ['active', 'out-of-service', 'missing', 'disposed'] as const
export type ItemState = typeof ITEM_STATES[number]

export const ITEM_EVENT_KINDS = ['added', 'edited', 'recategorised', 'moved', 'condition-changed', 'out-of-service', 'back-in-service', 'checked-out', 'returned', 'inspected', 'fault-reported', 'fault-closed', 'marked-missing', 'found', 'disposed'] as const
export type ItemEventKind = typeof ITEM_EVENT_KINDS[number]

export const CERTIFICATE = ['none', 'optional', 'required'] as const
export const DUE_SOURCES = ['category', 'item'] as const
export const RESULTS = ['pass', 'fail'] as const

export const LOAN_KINDS = ['production', 'member', 'outside'] as const
export type LoanKind = typeof LOAN_KINDS[number]
export const LOAN_STATES = ['draft', 'requested', 'approved', 'out', 'returned', 'declined', 'cancelled'] as const
export type LoanState = typeof LOAN_STATES[number]
export const DUE_BACK_SET = ['by-person', 'from-production'] as const
export const CANCEL_REASONS = ['by-borrower', 'by-staff', 'production-cancelled', 'item-withdrawn'] as const
export type CancelReason = typeof CANCEL_REASONS[number]

export const LINE_STATES = ['wanted', 'listed', 'promised', 'out', 'returned', 'lost', 'cancelled'] as const
export type LineState = typeof LINE_STATES[number]

export const FAULT_STATES = ['open', 'repaired', 'written-off'] as const
export type FaultState = typeof FAULT_STATES[number]
export const FAULT_SOURCES = ['report', 'return', 'inspection', 'show-report'] as const

export const DISPOSAL_STATES = ['proposed', 'approved', 'declined', 'done'] as const
export type DisposalState = typeof DISPOSAL_STATES[number]
export const DISPOSAL_METHODS = ['sold', 'donated', 'recycled', 'scrapped', 'lost', 'stolen', 'returned-to-owner'] as const

type Moves<S extends string> = Readonly<Record<S, readonly S[]>>

/** Part 3, "Items". Disposed is final. */
export const ITEM_MOVES: Moves<ItemState> = {
  'active': ['out-of-service', 'missing', 'disposed'],
  'out-of-service': ['active', 'missing', 'disposed'],
  'missing': ['active', 'disposed'],
  'disposed': [],
}

/** Part 3, "Loans and their lines". Returned, declined and cancelled are final (L1). */
export const LOAN_MOVES: Moves<LoanState> = {
  draft: ['requested', 'approved', 'cancelled'],
  requested: ['approved', 'declined', 'cancelled'],
  approved: ['out', 'cancelled'],
  out: ['returned'],
  returned: [],
  declined: [],
  cancelled: [],
}

export const LINE_MOVES: Moves<LineState> = {
  wanted: ['listed', 'promised', 'cancelled'],
  listed: ['promised', 'cancelled'],
  promised: ['out', 'cancelled'],
  out: ['returned', 'lost'],
  returned: [],
  lost: [],
  cancelled: [],
}

export const FAULT_MOVES: Moves<FaultState> = {
  'open': ['repaired', 'written-off'],
  'repaired': [],
  'written-off': [],
}

export const DISPOSAL_MOVES: Moves<DisposalState> = {
  proposed: ['approved', 'declined', 'done'],
  approved: ['done'],
  declined: [],
  done: [],
}

export const canMove = <S extends string>(moves: Moves<S>, from: S, to: S): boolean => moves[from].includes(to)

/** The states a record may be in to make the move to `to`. */
export const movesInto = <S extends string>(moves: Moves<S>, to: S): S[] => (Object.keys(moves) as S[]).filter(from => canMove(moves, from, to))

/** Lines in these states take the item for their loan's window (C1 to C3). */
export const TAKES_ITEM: readonly LineState[] = ['promised', 'out']

/** Two windows overlap when each starts before the other ends; touching ends do not. */
export const overlaps = (a: { from: number, to: number }, b: { from: number, to: number }): boolean => a.from < b.to && b.from < a.to

/** C3: an out line past its due time is busy to the right end, until it comes back. */
export const busyUntil = (line: { state: LineState, to: number }, now: number): number =>
  line.state === 'out' && line.to <= now ? Number.POSITIVE_INFINITY : line.to

/** I2: a tag is the department's prefix and its number, padded to four digits. */
export const tagOf = (prefix: string, n: number): string => `${prefix}-${String(n).padStart(4, '0')}` // not-policy: the tag format in part 2
