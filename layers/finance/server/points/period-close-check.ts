// Contract for finance.period-close-check: what stops a period being closed, from the module that
// holds the facts. Finance may not read another module's tables, so a till session still open or
// money taken and not settled is reported by Payments through this point. Read only.
export interface PeriodCloseCheck {
  /** The period runs from `startsOn` to `endsOn`, dates in the theatre's time zone, inclusive. */
  blockers?: (period: PeriodBounds) => Promise<{ sentence: string, to?: string }[]>
  /** What the treasurer should know before closing, such as costs still to come; never stops a close. */
  warnings?: (period: PeriodBounds) => Promise<{ sentence: string, to?: string }[]>
}

export interface PeriodBounds { id: string, startsOn: string, endsOn: string, startsAt: number, endsAt: number }
