// Contract for core.booking-action: the booking button for a performance on the public pages. Box
// office contributes; a theatre without it uses each performance's external booking link, and with
// neither no button shows. A contribution answers for many performances at once, so a listing of
// fifty dates is one call, and leaves out any performance it has nothing to say about.
//
// The answer carries facts, not sentences: the public button words each state itself, so the words
// follow the visitor's language. `label` overrides those words where a module needs its own.
export type BookingState = 'available' | 'limited' | 'sold-out' | 'not-yet' | 'closed'

export interface BookingSubject {
  id: string
  productionId: string
  startsAt: number
  endsAt: number
  capacity: number | null
}

export interface BookingAnswer {
  state: BookingState
  /** Where the button goes. Absent for a state with nowhere to go, such as closed. */
  link?: string
  /** For `limited`: how many seats are left, only where the theatre says the number. */
  seatsLeft?: number
  /** For `available`: half the house or more is sold, where the theatre says so. */
  sellingFast?: true
  /** For `not-yet`: when sales open, as an instant. */
  opensAt?: number
  /** For `sold-out`: where to join the waiting list, when the theatre keeps one. */
  waitingList?: string
  /** Words of the module's own in place of the state's usual ones. */
  label?: string
  /**
   * A global component that books this performance in a drawer over the public page, given `link`,
   * `title` and `when`. The button opens it; without scripts the link is followed as usual.
   */
  drawer?: string
}

/**
 * What a production costs, for "From £6 · Member £4" on a listing. Facts, not sentences: the public
 * pages word and format it. Amounts are in the currency's minor unit.
 */
export interface PriceSummary {
  currency: string
  /** The lowest price anyone may book at, or null when every price needs something (such as a membership or proof). */
  fromMinor: number | null
  /** The highest price anyone may book at, so a show whose every open price is nothing reads "Free". */
  toMinor?: number | null
  /** Lower prices for people who qualify (a concession, a membership), each by its ticket type's own name, lowest first. `gated` marks one held by an account (a membership, an award), never quoted as "From". */
  others: { label: string, amountMinor: number, gated?: true }[]
}

export interface BookingAction {
  actions: (performances: BookingSubject[]) => Promise<Record<string, BookingAnswer>>
  /** What each production is sold at, for listings. Optional; a production left out shows no price. */
  prices?: (productionIds: string[]) => Promise<Record<string, PriceSummary>>
}
