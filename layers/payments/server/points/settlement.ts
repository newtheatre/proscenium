// Contract for payments.settlement: an owner module's handlers for its parts of a payment (Box
// office specification, part 4, "One payment with several owners"). Each adds its own statements to
// the unit it is given and returns its ledger entries; Payments writes the one sealed posting. A
// handler never commits and never calls a provider. One contribution per owner module.
import type { UnitView } from '#kit'
import type { AccountRef } from '#modules/finance'

/** One part of a payment, as its owner is told about it. */
export interface Part {
  id: string
  intentId: string
  /** The owner's own record, such as an order id. */
  record: string
  amountMinor: number
  currency: string
}

/**
 * An owner's ledger entry for its part. The owner's entries total exactly the part's amount as
 * credits (their amounts sum to minus the part's amount) on a settle, and as debits on a refund, and
 * may reach only accounts whose module is the owner's own.
 */
export interface OwnerEntry {
  account: AccountRef
  amountMinor: number
  productionId?: string | null
  performanceId?: string | null
}

export interface Settlement {
  /**
   * The money for this part has arrived: make the owner's sale real (tickets issued, a bar sale
   * completed). Refusing, by throwing or by a guard that fails in the batch, settles nothing.
   */
  settle: (unit: UnitView, part: Part) => Promise<OwnerEntry[]> | OwnerEntry[]
  /** A refund of this part succeeded: return the entries that undo the income it refunds. */
  refunded: (unit: UnitView, part: Part, refund: { id: string, amountMinor: number }) => Promise<OwnerEntry[]> | OwnerEntry[]
  /**
   * The payment was cancelled, expired or could not be completed: undo what was prepared for this
   * part (seats, stock). Safe to call twice.
   */
  release?: (unit: UnitView, part: Part) => Promise<void> | void
}
