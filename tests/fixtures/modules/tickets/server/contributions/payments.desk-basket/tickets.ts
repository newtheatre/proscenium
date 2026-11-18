// A fixture panel: holds a ticket order for the amount the seller typed.
import { newId, type UnitView } from '#kit'
import type { DeskBasket, DeskContext } from '#modules/payments'

interface Input { amountMinor: number, deferredMinor?: number, performanceId?: string, quantity?: number }

export default {
  label: 'tickets.desk.label',
  panel: 'TicketsTillPanel',
  ability: 'tickets.orders.sell',
  order: 1,
  async prepare(unit: UnitView, context: DeskContext) {
    const input = context.input as Input
    const id = newId('tko')
    unit.add({ sql: "INSERT INTO tickets_orders (id, amount_minor, deferred_minor, performance_id, state) VALUES (?, ?, ?, ?, 'held')", params: [id, input.amountMinor, input.deferredMinor ?? 0, input.performanceId ?? null] })
    return { owner: { module: 'tickets', record: id }, amountMinor: input.amountMinor }
  },
  async summary(context: DeskContext) {
    const input = context.input as Input
    return { lines: [{ label: 'Tickets', amountMinor: input.amountMinor, quantity: input.quantity ?? 1, item: 'Ticket', key: 'all' }], amountMinor: input.amountMinor }
  },
} satisfies DeskBasket
