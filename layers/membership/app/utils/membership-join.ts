// What GET /api/membership/schemes says of an open scheme, for the join page and the join form, and
// how a fee is written.

export interface MembershipFee { amountMinor: number, currency: string }

export interface OfferedScheme {
  id: string
  key: string
  name: string
  summary: string | null
  side: 'members' | 'audience'
  joinMode: string
  options: { id: string, name: string, fee: MembershipFee | null }[]
  fee: MembershipFee | null
  requiresPayment: boolean
  online: boolean
  asksFor: string | null
  /** Joining asks the scheme's application form (MEM-12). */
  applicationForm?: boolean
}

/** A fee in the theatre's way of writing money. */
export function membershipMoney(fee: MembershipFee): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: fee.currency }).format(fee.amountMinor / 100) // not-policy: minor units to units
}
