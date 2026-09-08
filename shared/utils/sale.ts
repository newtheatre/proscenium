import { z } from 'zod'
import { inlineAgeCheckForm } from './age-checks'
import type { AgeCheckOutcome } from './age-checks'
import type { AllergenState, BarPriceSource, ServingKind } from './bar'

// The till's basket: what is on offer and what pricing one up costs, in integer pence (F-103).
// Nothing here writes anything; the sale itself is F-104's cross-check and F-105's atomic write.

// A basket line is a size at a quantity, plus the option chosen if its size offers one (0017).
// The theatre takes no cash, so nothing here ever carries a tender (F-104 criterion 4).
export const MAX_BASKET_LINE_QTY = 50
export const MAX_BASKET_LINES = 30

export const basketLineForm = z.object({
  variantId: z.string().trim().min(1),
  qty: z.number().int().positive('A line is a quantity of something').max(MAX_BASKET_LINE_QTY),
  choiceItemId: z.string().trim().min(1).nullish(),
})

export const basketForm = z.object({
  venueId: z.string().trim().min(1).optional(),
  performanceId: z.string().trim().min(1).optional(),
  lines: z.array(basketLineForm).min(1, 'A basket needs at least one line').max(MAX_BASKET_LINES),
})

export type BasketLineInput = z.output<typeof basketLineForm>
export type BasketInput = z.output<typeof basketForm>

// A sale submission carries what the screen believes the total is, so the server can refuse a
// stale or wrong figure by name rather than charging whatever it likes (0004, F-104 criterion 1).
// `ageCheck` answers the Challenge 25 prompt inline, when the basket needs one (F-106 criterion 1).
export const saleForm = basketForm.extend({
  expectedTotalPence: z.number().int().nonnegative(),
  ageCheck: inlineAgeCheckForm.nullish().transform(value => value ?? null),
})

export type SaleInput = z.output<typeof saleForm>

// What a size offers instead of a fixed recipe line: pick one, the depletion follows (F-113).
export interface SaleChoiceOption {
  id: string
  itemName: string
}

export interface SaleChoice {
  id: string
  name: string
  options: SaleChoiceOption[]
}

// Only what the till may sell right now: `ACTIVE`, and priced (0017, F-121). A product surfaced
// here always has at least one such size, which is what fixes the pre-F-112 activation gap.
export interface SaleVariant {
  id: string
  servingKind: ServingKind
  label: string
  pricePence: number
  priceSource: Exclude<BarPriceSource, null>
  choice: SaleChoice | null
}

export interface SaleProduct {
  id: string
  name: string
  categoryId: string
  ageRestricted: boolean
  allergenState: AllergenState
  allergenNote: string | null
  variants: SaleVariant[]
}

export interface SaleCategory {
  id: string
  name: string
  sort: number
  colour: string | null
}

export interface SaleCatalogue {
  on: string
  categories: SaleCategory[]
  products: SaleProduct[]
}

// One priced line, snapshotting what it resolved against so the total on screen is provably the
// total the server would charge (F-103 criterion 3, F-104's cross-check reads the same shape).
export interface PricedLine {
  variantId: string
  productName: string
  variantLabel: string
  choiceItemName: string | null
  qty: number
  unitPricePence: number
  priceSource: Exclude<BarPriceSource, null>
  amountPence: number
}

export interface PricedBasket {
  lines: PricedLine[]
  totalPence: number
}

// What a completed sale answers with (F-105): the ledger entry it posted, so a receipt or a void
// can cite it, and the same lines a price check would have shown. A refusal at Challenge 25 can
// leave nothing sold (`entryId` null) while still logging the check (F-106 criteria 1, 3).
export interface SaleReceipt {
  entryId: string | null
  totalPence: number
  lines: PricedLine[]
  ageCheck: { id: string, outcome: AgeCheckOutcome } | null
  refusedLines: PricedLine[]
}
