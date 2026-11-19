// The words for an order's state on the orders list and on the order itself. A paid order of free
// tickets from a request reads "Complimentary"; one whose tickets all came from a pass reads "On a
// pass", or "Pass not paid" while the pass itself is unpaid, so £0 never reads as paid in full.
export type OrderState = 'reserved' | 'awaiting_payment' | 'confirmed' | 'cancelled' | 'expired'
export interface OrderPass { name: string, paid: boolean, only: boolean }

const TONES = { reserved: 'warning', awaiting_payment: 'info', confirmed: 'success', cancelled: 'neutral', expired: 'neutral' } as const

export function orderStateBadge(order: { state: OrderState, complimentary?: boolean, pass?: OrderPass | null }, t: (key: string) => string): { tone: 'neutral' | 'success' | 'warning' | 'info', label: string } {
  if (order.state === 'confirmed' && order.pass?.only) {
    return order.pass.paid ? { tone: 'success', label: t('box-office.orders.state.pass') } : { tone: 'warning', label: t('box-office.orders.state.pass-unpaid') }
  }
  const key = order.state === 'confirmed' && order.complimentary ? 'complimentary' : order.state
  return { tone: TONES[order.state], label: t(`box-office.orders.state.${key}`) }
}
