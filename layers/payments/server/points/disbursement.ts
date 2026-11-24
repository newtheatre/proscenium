// Contract for payments.disbursement: an owner module's handler for money the theatre paid out
// against one of its records, such as a claim (Budgets) or a bill (Invoices) (P-A1). Like a
// settlement, it adds its own statements to the unit and returns its ledger entries; Payments
// writes the posting. One contribution per owner module.
import type { UnitView } from '#kit'
import type { OwnerEntry } from './settlement'

export type DisbursementMethod = 'bank-transfer' | 'cheque' | 'theatre-card' | 'petty-cash' | 'parent-body'

export interface DisbursementPart {
  disbursementId: string
  /** The owner's own record, such as a claim id. */
  ownerRecord: string
  amountMinor: number
  currency: string
  method: DisbursementMethod
}

export interface DisbursementHandler {
  /**
   * Money was paid out for this record: mark it paid (or part paid) and return the owner's entries,
   * debits on its own accounts totalling exactly the amount, such as the claims payable cleared.
   * Refuse, by throwing or by a guard that fails in the batch, a part larger than what is owed.
   */
  settle: (unit: UnitView, part: DisbursementPart) => Promise<OwnerEntry[]> | OwnerEntry[]
  /** A recorded payment was a mistake and has been reversed: undo what settle marked. */
  reversed: (unit: UnitView, part: DisbursementPart) => Promise<void> | void
  /** Whom the record pays, so the payment screen can offer their bank details. Null when nobody is known. */
  payee?: (ownerRecord: string) => Promise<{ module: string, id: string } | null>
}
