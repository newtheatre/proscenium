// The words a company's dealings move through (spec part 2 and part 3), shared by the server and the screens.
export const ENGAGEMENT_KINDS = ['visiting', 'act', 'hire'] as const
export const ENGAGEMENT_STATES = ['enquiry', 'offered', 'agreed', 'confirmed', 'completed', 'settled', 'cancelled'] as const
export const DEPOSIT_STATES = ['none', 'due', 'held', 'returned', 'kept', 'part-kept'] as const
export const ENGAGEMENT_EVENT_KINDS = [
  'opened', 'moved', 'cancelled', 'linked', 'agreement-sent', 'agreement-answered', 'agreement-withdrawn',
  'agreement-superseded', 'call-changed', 'people-changed', 'allocation-made', 'allocation-changed',
  'allocation-closed', 'allocation-released', 'guest-named', 'guest-withdrawn', 'deposit-changed',
  'settlement-drafted', 'settlement-proposed', 'settlement-answered', 'settlement-approved', 'settlement-paid',
] as const
export const RECEIVES = ['schedule', 'agreement', 'guests', 'settlement'] as const
export const DEAL_TYPES = ['split', 'guarantee', 'guarantee-or-split', 'hire', 'none'] as const
export const SHARE_BASES = ['net-of-fees', 'gross'] as const
export const HIRE_FEE_BASES = ['flat', 'per-performance', 'per-hour'] as const
export const AGREEMENT_STATES = ['draft', 'sent', 'accepted', 'declined', 'superseded', 'withdrawn'] as const
export const ANSWERS = ['accepted', 'declined'] as const
export const CALL_KINDS = ['get-in', 'technical', 'dress', 'get-out', 'other'] as const
export const ALLOCATION_STATES = ['open', 'closed', 'released'] as const
export const GUEST_STATES = ['named', 'issued', 'withdrawn'] as const
export const SETTLEMENT_STATES = ['draft', 'proposed', 'agreed', 'queried', 'approved', 'paid', 'superseded', 'void'] as const
export const LINE_KINDS = ['company-share', 'guarantee-top-up', 'hire-fee', 'charge', 'deposit-kept', 'adjustment', 'note'] as const
export const PAYMENT_DIRECTIONS = ['out', 'in'] as const
export const PAYMENT_METHODS = ['bank-transfer', 'cheque', 'payments'] as const

export type EngagementKind = typeof ENGAGEMENT_KINDS[number]
export type EngagementState = typeof ENGAGEMENT_STATES[number]
export type Receives = typeof RECEIVES[number]

/** Part 3's moves a person makes; the listeners and the daily task make the rest. */
export const MOVES = {
  confirm: { from: ['agreed'], to: 'confirmed' },
  cancel: { from: ['enquiry', 'offered', 'agreed', 'confirmed', 'completed'], to: 'cancelled' },
} as const satisfies Record<string, { from: readonly EngagementState[], to: EngagementState }>
export type Move = keyof typeof MOVES

// The columns' bounds (part 2), checked by the routes before the tables' own checks.
export const LIMITS = { name: 160, legalName: 200, registration: 60, taxNumber: 30, address: 400, postcode: 12, website: 300, description: 600, notes: 4000, role: 80, phone: 30, title: 160, reason: 500, personName: 120, email: 254, places: 50 } // not-policy: the columns' bounds
