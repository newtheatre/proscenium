// What GET /api/payments/session answers, for the Your session card on Sessions and the till.

export interface YourSessionSummary {
  handlesCash: boolean
  id: string
  spaceId: string | null
  place: string | null
  pointLabel: string
  openedAt: number
  state: 'open' | 'counting' | 'closed'
  floatMinor: number
  expectedCashMinor: number
  currency: string
  lastSaleAt?: number
  closesAt?: number
}

export interface WaitingPayment { id: string, method: string, amountMinor: number, currency: string, state: string, provider: string, startedAt: number, unknownAt: number | null }

export interface YourSession {
  mayOpen: boolean
  mayViewAll: boolean
  cashTaken: boolean
  session: YourSessionSummary | null
  waiting: WaitingPayment[]
  awaiting: YourSessionSummary[]
  /** A sale in the open session that was started and neither paid nor cancelled, such as one left by a reload. */
  unfinished?: { intentId: string, amountMinor: number } | null
  /** Every sale open in the session, newest first; the seller's other devices may be taking some of them. */
  openSales?: { intentId: string, amountMinor: number }[]
  /** Where the next session opens when the device has no place of its own. */
  defaultSpaceId?: string | null
  /** What the open session has taken, by way of paying. */
  takings?: { method: string, amountMinor: number }[]
  /** The open session's latest sales, newest first. */
  sales?: YourSale[]
}

/** One of the session's sales; `owners` names what it was for, such as a booking's reference and where it opens. */
export interface YourSale { intentId: string, at: number, amountMinor: number, currency: string, state: string, methods: string[], notes: string[], owners: { module: string, reference: string | null, to: string | null }[] }
