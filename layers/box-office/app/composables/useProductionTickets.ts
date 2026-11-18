// A production's tickets at a glance, read once for its Tickets tab and its summary fact.
export interface ProductionTicketsRow { id: string, label: string | null, startsAt: number, scheduled: boolean, past: boolean, sales: SaleState | null, capacity: number, taken: number, pools: { bandId: string, capacity: number, claimed: number }[], ownSeats: boolean }
export interface ProductionTickets {
  production: { id: string, title: string, state: 'draft' | 'published' | 'withdrawn' | 'cancelled' }
  sections: { id: string, name: string, kind: string, sort: number }[]
  /** The seats most of the run sells in each section, by section id. */
  runSeats: Record<string, number>
  /** The production's own prices, which every performance charges unless it has its own. */
  runPrices: { bandId: string, ticketTypeId: string, amountMinor: number }[]
  performances: ProductionTicketsRow[]
  totals: { performances: number, onSale: number, taken: number, capacity: number }
}

export function useProductionTickets(productionId: MaybeRefOrGetter<string>) {
  return useAPI<ProductionTickets>(() => `/api/box-office/productions/${encodeURIComponent(toValue(productionId))}/tickets`, { key: `box-office:production-tickets:${toValue(productionId)}` })
}
