// Contract for payments.desk-basket: a module's panel in the till, through which it adds its own
// lines to the payment being taken (Box office specification, part 4). Box office is one contributor
// among others, so a bar works without a box office. What `prepare` makes is undone by the owner's
// payments.settlement release.
import type { UnitView } from '#kit'

export interface DeskContext {
  sessionId: string
  /** What the seller has put in this module's panel, as the panel sent it. */
  input: unknown
}

export interface DeskBasket {
  /** The panel's name, as a translation key. */
  label: string
  /** The ability a seller needs to see and use the panel. */
  ability: string
  /**
   * The panel's component, by name: a file in the contributing layer's `app/till-panels/` folder,
   * which Payments registers globally. It takes `modelValue` (the input, or null for nothing in the
   * panel), `locked` (a payment is being taken) and `summary` (what `summary` last said, or null),
   * and emits `update:modelValue`.
   */
  panel: string
  /** Its place among the panels; Box office's comes first. */
  order?: number
  /**
   * Adds to the unit whatever makes the sale real but unpaid, and says whose it is and how much
   * (above zero). Called in the batch that creates the intent.
   */
  prepare: (unit: UnitView, context: DeskContext) => Promise<{ owner: { module: string, record: string }, amountMinor: number }>
  /**
   * Called once the intent is in the batch, with the record `prepare` named and the intent's id,
   * for an owner that keeps on its record which payment it is waiting for. The intent's row comes
   * before these statements, so a foreign key to it holds.
   */
  attach?: (unit: UnitView, record: string, intentId: string) => Promise<void> | void
  /** Lines and an amount for display. Reads only. */
  summary: (context: DeskContext) => Promise<{ lines: { label: string, amountMinor: number }[], amountMinor: number }>
}
