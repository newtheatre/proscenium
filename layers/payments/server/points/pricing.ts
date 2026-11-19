// Contract for payments.pricing: what prices a sale before any of it is written (the unified
// promotions design). Every selling module hands its items, at their list prices, to priceSale in
// #modules/payments, and writes the saving each comes back with on its own line. Promotions is the
// contributor; with nobody contributing, every item comes back at its list price. A module never
// learns what priced it, only the saving and a reference to keep on the line.
import type { UnitView } from '#kit'

export interface PricingItem {
  /** The seller's own key for the item, unique in the sale: a line, or a ticket's place in it. */
  key: string
  /** A promotions target kind, such as 'box-office.ticket'. */
  kind: string
  /** The price of one unit before any promotion, in minor units. */
  listMinor: number
  quantity: number
  /** The price is already reduced for who the buyer is: a member's or a concession's. */
  reduced?: boolean
  /** What a promotion may be narrowed by, as the kind's owner describes it. */
  facts: Record<string, unknown>
}

export interface PricingInput {
  items: PricingItem[]
  channel: 'online' | 'till'
  /** Codes as the buyer typed them. One that cannot be used is refused, saying why. */
  codes?: string[]
  /** For a preview: prices each item as if alone, ignoring a promotion's limit for one sale. */
  preview?: boolean
  /** Promotions a seller picked at the till, with the reason given where one is asked for. Each is checked against what the seller may give. */
  staff?: { promotionId: string, reason?: string }[]
}

/** A promotion a seller may pick at the till, for the till's list. */
export interface StaffChoice {
  promotionId: string
  /** What the customer sees on the saving. */
  label: string
  /** The staff's own name for it. */
  name: string
  /** A reason must be given to apply it. */
  needsReason: boolean
}

/** A saving the pricer has worked out and will write when asked, keyed by the item. */
export interface PricedSaving {
  key: string
  promotionId: string
  codeId: string | null
  minor: number
  uses: number
  /** The reason a seller gave for a promotion they picked. */
  reason?: string | null
}

export interface PricedSale {
  /** Each item's whole saving, in the items' order, nought for one with none. */
  items: { key: string, discountMinor: number }[]
  /** What each promotion took off the whole sale, for a summary line. */
  applied: { promotionId: string, label: string, code: string | null, savingMinor: number, effect: string, value: number, maxPerSale: number | null }[]
  /** What to write if the sale goes ahead: pass back to the pricer's redeem unchanged. */
  savings: PricedSaving[]
  /** Uses already given back that the pricer will record as released when it redeems. */
  stale: string[]
}

export interface Pricing {
  price: (input: PricingInput) => Promise<PricedSale>
  /** The promotions the seller now may pick at the till. Reads only. */
  choices: () => Promise<StaffChoice[]>
  /** Whether anything could take money off a sale on this channel with no code given, so a seller can skip pricing when nothing would. Reads only. */
  automatic: (channel: PricingInput['channel']) => Promise<boolean>
  /**
   * Writes the savings into the unit, guarded so a promotion's last use is given once, and returns
   * the id of the first saving on each item, by key, for the seller to keep on its line. `refs` says,
   * by key, what the seller answers for when asked whether the saving still stands (a seat's claim).
   */
  redeem: (unit: UnitView, priced: PricedSale, owner: { kind: string, saleRef: string, refs: Record<string, string> }) => Record<string, string>
  /**
   * Moves kept savings to new references, when the seller moves an item: a seat let go and taken
   * again for a split booking. The use stays counted once; returns the new id for each old one that
   * was still standing, by old id. Reads first, then writes into the unit.
   */
  move: (unit: UnitView, moves: { id: string, ref: string, saleRef: string }[]) => Promise<Record<string, string>>
  /** What a kept reference was: the promotion's label and the code it was used with. */
  describe: (ids: string[]) => Promise<Map<string, { label: string, code: string | null }>>
}
