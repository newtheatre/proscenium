// Revenue by show (I-106): collected, unrefunded ticket money only, gross, refunded and net
// reported separately, door and pre-booked distinguishable, never bar or pass-sale revenue.

export interface ShowRevenueRow {
  showId: string
  showTitle: string
  grossPence: number
  refundedPence: number
  netPence: number
  walkUpPence: number
  preBookedPence: number
  passAdmissions: number
}

// A ticketing line with no performance link (the pre-#791/#795 gap, known-issues.md) is real
// money, counted here explicitly rather than silently missing from every per-show row.
export interface UnattributedRevenue {
  grossPence: number
  refundedPence: number
  netPence: number
}

// Pass revenue at pass level, never folded into a show's own figure (criterion 4): what a pass
// actually admitted to, against every show its type covers.
export interface PassUtilisationRow {
  passId: string
  reference: string
  passTypeName: string
  pricePaid: number
  coveredShows: number
  admittedShows: number
}

export interface RevenueByShowReport {
  fromDay: string
  toDay: string
  byShow: ShowRevenueRow[]
  unattributed: UnattributedRevenue
  passes: PassUtilisationRow[]
}
