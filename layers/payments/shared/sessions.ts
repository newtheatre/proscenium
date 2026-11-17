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
}
