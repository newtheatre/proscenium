// What a buyer agreed to by booking: the tickets and booking terms (/policies/tickets) as they read
// at that moment, kept on the order.
import { sql } from 'drizzle-orm'
import type { UnitView } from '#kit'
import { currentPolicyVersion } from '#modules/core'

/** Written with the checkout or the reservation, so an order that does not go through keeps none. */
export async function stampTerms(unit: UnitView, orderId: string): Promise<void> {
  const terms = await currentPolicyVersion('tickets')
  if (terms) unit.add(sql`UPDATE box_office_orders SET terms_version_id = ${terms.id} WHERE id = ${orderId}`)
}
