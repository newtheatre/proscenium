// A fixture panel: holds a snack sale for the amount the seller typed.
import { newId, type UnitView } from '#kit'
import type { DeskBasket, DeskContext } from '#modules/payments'

export default {
  label: 'snacks.desk.label',
  panel: 'SnacksTillPanel',
  ability: 'payments.attempt.attest',
  order: 2,
  async prepare(unit: UnitView, context: DeskContext) {
    const { amountMinor } = context.input as { amountMinor: number }
    const id = newId('sns')
    unit.add({ sql: "INSERT INTO snacks_sales (id, amount_minor, state) VALUES (?, ?, 'held')", params: [id, amountMinor] })
    return { owner: { module: 'snacks', record: id }, amountMinor }
  },
  async summary(context: DeskContext) {
    const { amountMinor } = context.input as { amountMinor: number }
    return { lines: [{ label: 'Snacks', amountMinor }], amountMinor }
  },
} satisfies DeskBasket
