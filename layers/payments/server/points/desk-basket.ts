// Contract for payments.desk-basket: a module's panel in the till, through which it adds its own
// lines to the payment being taken (Box office specification, part 4). Box office is one contributor
// among others, so a bar works without a box office. What `prepare` makes is undone by the owner's
// payments.settlement release.
import type { UnitView } from '#kit'

/** One line of a panel's summary. */
export interface SummaryLine {
  label: string
  amountMinor: number
  quantity?: number
  item?: string
  /** The owner's own name for the line, such as an order line's id, handed back at settle with who paid for it. */
  key?: string
}

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
  /** A short name for its tab in the combined till, as a translation key; the label when absent. */
  tab?: string
  /** An icon for its tab in the combined till, such as "i-lucide-ticket". */
  icon?: string
  /**
   * A larger panel for the combined till in live mode, by component name as `panel` is, taking the
   * same props. Without one, `panel` is drawn there.
   */
  livePanel?: string
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
  /**
   * Where the sale in the panel happens, such as the space of tonight's performance it sells for, or
   * null when it does not say. A session opened by this sale opens there when the device has no
   * place of its own. Reads only.
   */
  space?: (context: Pick<DeskContext, 'input'>) => Promise<string | null>
  /**
   * Lines and an amount for display. Reads only, and comes before any session is open. A line of
   * several of the same thing says how many (`quantity`, 1 when absent) and what one of them is
   * called (`item`, the label when absent): a split sale gives each one to a person, and the line's
   * amount is shared between them a penny at a time from the first. A sale is split only by these
   * lines, so they must add up to the amount `prepare` gives.
   */
  summary: (context: Pick<DeskContext, 'input'>) => Promise<{ lines: SummaryLine[], amountMinor: number }>
}
