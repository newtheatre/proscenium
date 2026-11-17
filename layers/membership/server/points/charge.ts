// Contract for membership.charge: something that collects a fee for a membership (tab 4, part 3;
// rules S5, P1, P2). Membership never imports its contributor, so a free member list needs no
// Payments. While nothing answers, a scheme that requires payment cannot be joined online. The
// membership-fees module is the one shipped contributor.
import type { UnitView } from '#kit'

export type ChargeKind = 'join' | 'renew'

/** What a membership would cost, or costs: the price in force on a day, copied onto the charge. */
export interface ChargeQuote { priceId: string, amountMinor: number, currency: string }

export interface ChargeStatus { id: string, state: 'open' | 'paid' | 'void' | 'refunded' | 'part-refunded', amountMinor: number, refundedMinor: number, currency: string }

export interface MembershipCharge {
  /** The price in force on `on` for the length chosen (a price for that length wins over one for every length), or null when none is set. */
  priceFor: (schemeId: string, lengthOptionId: string | null, kind: ChargeKind, on: string) => Promise<ChargeQuote | null>
  /** Adds the charge for a membership to the caller's unit (P1). Refuses when no price is in force. */
  open: (unit: UnitView, input: { membershipId: string, schemeId: string, lengthOptionId: string | null, kind: ChargeKind, on: string }) => Promise<ChargeQuote>
  /** Voids the membership's open charge, cancelling any payment still being taken for it. Nothing when there is none. */
  void: (unit: UnitView, membershipId: string) => Promise<void>
  /** The membership's charge that is not void, or null. Reads only. */
  status: (membershipId: string) => Promise<ChargeStatus | null>
}
