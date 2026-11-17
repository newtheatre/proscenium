// A fixture settlement handler: the programmes' income, with nothing of its own to mark paid.
import type { UnitView } from '#kit'
import type { Part, Settlement } from '#modules/payments'

export default {
  async settle(_unit: UnitView, part: Part) {
    return [{ account: { key: 'gallery.income' }, amountMinor: -part.amountMinor }]
  },
  async refunded(_unit: UnitView, _part: Part, refund: { amountMinor: number }) {
    return [{ account: { key: 'gallery.income' }, amountMinor: refund.amountMinor }]
  },
  release() {},
} satisfies Settlement
