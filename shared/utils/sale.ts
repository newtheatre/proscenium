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
  variantId: z.string().trim().min(1, 'Say which variant you mean'),
  qty: z.number().int().positive('A line is a quantity of something').max(MAX_BASKET_LINE_QTY),
  choiceItemId: z.string().trim().min(1, 'Say which choice you mean').nullish(),
})

export const basketForm = z.object({
  venueId: z.string().trim().min(1, 'Say which venue you mean').optional(),
  performanceId: z.string().trim().min(1, 'Say which performance you mean').optional(),
  lines: z.array(basketLineForm).min(1, 'A basket needs at least one line').max(MAX_BASKET_LINES),
  // On both the price check and the sale itself, so a discount is never a surprise at charge time
  // that the screen never priced (F-104 criterion 1, F-117 criterion 4).
  discountId: z.string().trim().min(1, 'Say which discount you mean').nullish().transform(value => value ?? null),
})

export type BasketLineInput = z.output<typeof basketLineForm>
export type BasketInput = z.output<typeof basketForm>

// A booking's ticket money joining the basket (F-122), and a walk-up sold from it (F-123). Both
// bounded, so the collection reads never bind a growing list (0003).
export const MAX_TICKET_LINES = 10
export const MAX_WALK_UP_LINES = 10

export const ticketLineForm = z.object({
  reservationId: z.string().trim().min(1, 'Say which booking you mean'),
})

export const walkUpLineForm = z.object({
  performanceId: z.string().trim().min(1, 'Say which performance you mean'),
  ticketTypeId: z.string().trim().min(1, 'Say which ticket type you mean'),
  quantity: z.number().int().positive().max(20),
})

// Encouraged, so the booker gets the confirmation and its QR, and optional (D-115 criterion 6).
export const walkUpGuestForm = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(200),
  email: z.string().email('Enter a real email address').max(320),
})

// The screen's own belief of the total (0004, F-104 criterion 1), an inline Challenge 25 outcome
// when the basket needs one (F-106), and a tab holder to charge instead of the reader (F-108).
export const saleForm = basketForm.extend({
  // A ticket-only basket has no bar line at all (F-122), so the one-line floor moves here.
  lines: z.array(basketLineForm).max(MAX_BASKET_LINES),
  expectedTotalPence: z.number().int().nonnegative(),
  ageCheck: inlineAgeCheckForm.nullish().transform(value => value ?? null),
  tabHolderId: z.string().trim().min(1, 'Say who holds the tab').nullish().transform(value => value ?? null),
  tickets: z.array(ticketLineForm).max(MAX_TICKET_LINES).default([])
    .refine(tickets => new Set(tickets.map(ticket => ticket.reservationId)).size === tickets.length, 'That booking is in the basket twice'),
  walkUps: z.array(walkUpLineForm).max(MAX_WALK_UP_LINES).default([])
    .refine(
      lines => new Set(lines.map(line => `${line.performanceId}:${line.ticketTypeId}`)).size === lines.length,
      'A ticket type appears once per performance; add to its quantity instead of a second line',
    ),
  walkUpGuest: walkUpGuestForm.nullish().transform(value => value ?? null),
}).refine(
  input => input.lines.length + input.tickets.length + input.walkUps.length > 0,
  { path: ['lines'], message: 'A basket needs at least one line' },
).refine(
  // Credit never marks a booking paid (F-122 criterion 5): a tab carries bar lines only.
  input => input.tabHolderId === null || (input.tickets.length === 0 && input.walkUps.length === 0),
  { path: ['tabHolderId'], message: 'Ticket money cannot go on a tab' },
)

export type SaleInput = z.output<typeof saleForm>

// Whether the reader must answer ahead of the write (0096): only a tab charge and a basket with
// nothing left to take involve no reader, so only they post in one step.
export function needsTheReader(sale: Pick<SaleInput, 'tabHolderId' | 'expectedTotalPence'>): boolean {
  return sale.tabHolderId === null && sale.expectedTotalPence > 0
}
export type TicketLineInput = z.output<typeof ticketLineForm>
export type WalkUpLineInput = z.output<typeof walkUpLineForm>
export type WalkUpGuestInput = z.output<typeof walkUpGuestForm>

// What the Tickets tab shows about a booking it found (F-122 criterion 2): no email, no price
// per ticket, only what is owed and whether the till may take it.
export interface TillBooking {
  id: string
  reference: string
  status: string
  performanceId: string
  showTitle: string
  startsAt: number
  venueName: string
  isTonight: boolean
  bookerFirstName: string | null
  partySize: number
  owedPence: number
  // Null when the booking can join the basket; otherwise why it cannot, in the desk's words.
  refusal: string | null
}

export interface WalkUpOption {
  id: string
  name: string
  price: number
}

// What a size offers instead of a fixed recipe line: pick one, the depletion follows (F-113).
export interface SaleChoiceOption {
  id: string
  itemName: string
  // The till catalogue's alone (F-128 criterion 9); the sale path reads no stock and leaves it off.
  stock?: VariantStock | null
}

export interface SaleChoice {
  id: string
  name: string
  options: SaleChoiceOption[]
}

// What on-hand supports of a size, as the catalogue was read: advice, since the device may hold
// it for hours; `blocks` only once a stocktake has made on-hand a balance (F-128 criterion 8, 0080).
export interface VariantStock {
  servingsLeft: number
  blocks: boolean
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
  // Null for a size that depletes nothing, which has nothing to run out of.
  stock: VariantStock | null
}

export function variantStock(servingsLeft: number | null, stockCounted: boolean): VariantStock | null {
  if (servingsLeft === null) return null
  return { servingsLeft, blocks: stockCounted && servingsLeft <= 0 }
}

// Each option as if it were the only one offered, which is what picking it pours (criterion 9).
export function choiceWithStock(choice: SaleChoice | null, servingsOf: ReadonlyMap<string, number> | undefined, stockCounted: boolean): SaleChoice | null {
  if (!choice) return null
  return { ...choice, options: choice.options.map(option => ({ ...option, stock: variantStock(servingsOf?.get(option.id) ?? null, stockCounted) })) }
}

// A size or a choice option alike. Optional chaining because a catalogue cached before either
// carried stock has no field at all.
type Stocked = { stock?: VariantStock | null }
export const sizeOutOfStock = (variant: Stocked): boolean => (variant.stock?.servingsLeft ?? 1) <= 0
export const sizeBlocked = (variant: Stocked): boolean => variant.stock?.blocks === true
export const productOutOfStock = (product: Pick<SaleProduct, 'variants'>): boolean => product.variants.every(sizeOutOfStock)
export const productBlocked = (product: Pick<SaleProduct, 'variants'>): boolean => product.variants.every(sizeBlocked)

// Each receipt the till can show, in a fixed order: one appearing where there was none is a sale
// just completed, whichever path took it, and the grid's stock is read again (criterion 9).
export function saleJustCompleted(receipts: readonly unknown[], before: readonly unknown[]): boolean {
  return receipts.some((receipt, at) => receipt != null && before[at] == null)
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

// What the category row leaves on the grid (F-103 criterion 6): All, or one category; a chosen
// category that has since emptied falls back to All rather than to a blank grid.
export function categoriesShown<T extends { id: string }>(categories: T[], chosenId: string | null): T[] {
  const chosen = chosenId === null ? undefined : categories.find(category => category.id === chosenId)
  return chosen ? [chosen] : categories
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
  // The line's own sticker amount: gross, before any discount (unchanged by F-117).
  amountPence: number
  // What a discount took off this line, 0 when none applies. Never negative to the line: it is
  // subtracted from `amountPence`, never itself the charge (F-117 criterion 3).
  discountPence: number
}

export interface PricedBasket {
  lines: PricedLine[]
  // Net: the sum of every line's `amountPence` less its `discountPence` (F-117 criterion 4).
  totalPence: number
  discount: { id: string, name: string, percent: number } | null
}

// What a completed sale answers with (F-105): `entryId` can be null on a full age-check refusal
// (F-106); `tab` is set only on a tab charge (F-108), `comp` only on a comp, `totalPence` zero (F-110).
export interface SaleReceipt {
  entryId: string | null
  totalPence: number
  lines: PricedLine[]
  ageCheck: { id: string, outcome: AgeCheckOutcome } | null
  refusedLines: PricedLine[]
  discount: { id: string, name: string, percent: number } | null
  tab: { holderName: string, outstandingPence: number, capOverridden: boolean } | null
  comp: { reason: string, foregonePence: number } | null
  // The bookings collected at the bar (F-122) and the walk-ups sold there (F-123); a walk-up
  // carries its door pass, the QR of its own booking link.
  tickets: CollectedTicketLine[]
  walkUps: WalkUpReceipt[]
}

export interface CollectedTicketLine {
  reservationId: string
  reference: string
  amountPence: number
}

export interface WalkUpReceipt {
  reservationId: string
  reference: string
  performanceId: string
  showTitle: string
  partySize: number
  amountPence: number
  qrUrl: string
  qrSvg: string
}

// The whole basket as the till sees it before charging: bar lines net of any discount, the
// bookings' amounts owed and the walk-ups at their resolved prices (F-122 criterion 4).
export interface PricedSale {
  bar: PricedBasket
  ticketsPence: number
  walkUpsPence: number
  totalPence: number
}

// One wording for a basket the stock register cannot cover, whichever check reaches it first:
// the read before the SumUp hand-off or the sale's own trigger (F-124 criterion 8, F-105).
export const NOT_ENOUGH_STOCK = 'Not enough left in stock for this sale: nothing has been charged.'

// The items a basket needs more of than is on hand, summed across its lines as the trigger sees
// them in one batch; an item absent from `onHand` has none (F-124 criterion 8).
export function stockShortOf(
  lines: ReadonlyArray<{ depletion: ReadonlyArray<{ itemId: string, qty: number }>, qty: number }>,
  onHand: ReadonlyMap<string, number>,
): string[] {
  const needed = new Map<string, number>()
  for (const line of lines) {
    for (const ingredient of line.depletion) {
      needed.set(ingredient.itemId, (needed.get(ingredient.itemId) ?? 0) + ingredient.qty * line.qty)
    }
  }
  return [...needed].filter(([itemId, qty]) => qty > (onHand.get(itemId) ?? 0)).map(([itemId]) => itemId)
}
