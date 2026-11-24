// A fixture disbursement handler: a snack sale stands in for a bill owed ('owed'), paid ('paid').
import type { UnitView } from '#kit'
import type { DisbursementHandler, DisbursementPart } from '#modules/payments'

export default {
  settle(unit: UnitView, part: DisbursementPart) {
    unit.add({ sql: "UPDATE snacks_sales SET state = 'paid' WHERE id = ? AND state = 'owed' AND amount_minor = ?", params: [part.ownerRecord, part.amountMinor] })
      .expect(1, { code: 'snacks.bill.not-owed', reason: 'This bill is not owed, or not for that amount.' })
    return [{ account: { key: 'snacks.payable' }, amountMinor: part.amountMinor }]
  },
  reversed(unit: UnitView, part: DisbursementPart) {
    unit.add({ sql: "UPDATE snacks_sales SET state = 'owed' WHERE id = ? AND state = 'paid'", params: [part.ownerRecord] }).expect(1)
  },
} satisfies DisbursementHandler
