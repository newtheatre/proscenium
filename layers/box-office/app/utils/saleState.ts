// The words for where a performance's sales stand, the same on the Performances list and on the
// performance's own set-up: "Not set up" until a section has seats, then "Not on sale" until it is
// put on sale, then the sales record's own state.
export type SaleState = 'draft' | 'on_sale' | 'paused' | 'closed'

const TONES = { draft: 'neutral', on_sale: 'success', paused: 'warning', closed: 'neutral' } as const

export function saleStateBadge(sales: SaleState | null, seats: number, t: (key: string) => string): { tone: 'neutral' | 'success' | 'warning', label: string } {
  if (!sales || (sales === 'draft' && seats <= 0)) return { tone: 'neutral', label: t('box-office.performances.not-set-up') }
  return { tone: TONES[sales], label: t(`box-office.performances.sales.${sales}`) }
}
