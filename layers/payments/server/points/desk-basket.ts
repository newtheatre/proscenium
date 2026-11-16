// Contract for payments.desk-basket: a module's panel in the till, through which it adds its own
// lines to the payment being taken (Box office specification, part 4). Box office is one contributor
// among others, so a bar works without a box office.
import type { UnitView } from '#kit'

export interface DeskContext {
  sessionId: string
  /** What the seller has put in this module's panel, as the panel sent it. */
  input: unknown
}

export interface DeskBasket {
  /**
   * Adds to the unit whatever makes the sale real but unpaid, and says whose it is and how much.
   * Called in the batch that creates the intent. Undone by the owner's payments.settlement release.
   */
  prepare: (unit: UnitView, context: DeskContext) => Promise<{ owner: { module: string, record: string }, amountMinor: number }>
  /** Lines and an amount for display. Reads only. */
  summary: (context: DeskContext) => Promise<{ lines: { label: string, amountMinor: number }[], amountMinor: number }>
}
