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

/** One night out: the bookings a person holds for one performance, in the order they came. */
export interface MyNight { performance: MyVisit['performance'], production: MyVisit['production'], bookings: MyVisit[] }
export function byPerformance(visits: MyVisit[]): MyNight[] {
  const nights = new Map<string, MyNight>()
  for (const v of visits) {
    const night = nights.get(v.performance.id) ?? { performance: v.performance, production: v.production, bookings: [] }
    night.bookings.push(v)
    nights.set(v.performance.id, night)
  }
  return [...nights.values()]
}
