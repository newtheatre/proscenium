// The answer of /api/box-office/orders/mine, as My tickets and the overview's card read it.
export interface MyVisit {
  orderId: string
  reference: string
  state: 'reserved' | 'awaiting_payment' | 'confirmed'
  currency: string
  amountDueMinor: number
  performance: { id: string, startsAt: number, endsAt: number, venue: string, state: string }
  production: { title: string, slug: string }
  tickets: { lineId: string, label: string, doorCode: string | null, admitted: boolean }[]
}
export interface MyBookings { upcoming: MyVisit[], past: MyVisit[] }
