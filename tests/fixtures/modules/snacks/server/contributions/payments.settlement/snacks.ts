// A fixture settlement handler. Tests set `misbehave` to make it post to another module's account or
// return entries that do not total its part.
import type { UnitView } from '#kit'
import type { Part, Settlement } from '#modules/payments'

export const misbehave: { account?: string, shortBy?: number } = {}

export default {
  settle(unit: UnitView, part: Part) {
    unit.add({ sql: "UPDATE snacks_sales SET state = 'sold' WHERE id = ? AND state = 'held'", params: [part.record] })
      .expect(1, { code: 'snacks.sale.gone', reason: 'This sale is no longer held.' })
    return [{ account: { key: misbehave.account ?? 'snacks.income' }, amountMinor: -part.amountMinor + (misbehave.shortBy ?? 0) }]
  },
  refunded(_unit: UnitView, _part: Part, refund: { amountMinor: number }) {
    return [{ account: { key: 'snacks.income' }, amountMinor: refund.amountMinor }]
  },
  release(unit: UnitView, part: Part) {
    unit.add({ sql: "UPDATE snacks_sales SET state = 'released' WHERE id = ? AND state = 'held'", params: [part.record] })
  },
} satisfies Settlement
