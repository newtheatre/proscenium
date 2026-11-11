import { createError } from 'h3'
import { findByEmail } from './accounts'
import { guestAccount } from './reservations'

export const PASS_HOLDER_CLOSED_SAYS = 'That address belongs to a closed account, so a pass cannot be issued to it. Nothing has been charged.'

// D-138 criterion 1 (0260): an address nobody holds becomes a guest record, exactly as a guest
// booking makes one; a closed or disabled account's address is refused rather than revived.
export async function guestPassHolder(buyer: { name: string, email: string }): Promise<string> {
  const existing = await findByEmail(buyer.email)
  if (existing && (existing.anonymisedAt !== null || existing.disabled)) {
    throw createError({ statusCode: 409, statusMessage: PASS_HOLDER_CLOSED_SAYS })
  }
  return (await guestAccount(buyer.email, buyer.name)).id
}
