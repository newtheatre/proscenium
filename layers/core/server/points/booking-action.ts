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
  /** For `limited`: how many seats are left. */
  seatsLeft?: number
  /** For `not-yet`: when sales open, as an instant. */
  opensAt?: number
  /** For `sold-out`: where to join the waiting list, when the theatre keeps one. */
  waitingList?: string
  /** Words of the module's own in place of the state's usual ones. */
  label?: string
}

export interface BookingAction {
  actions: (performances: BookingSubject[]) => Promise<Record<string, BookingAnswer>>
}
