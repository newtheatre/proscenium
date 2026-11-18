// Which booking a request to the order link routes opens: the one whose link token is in
// x-order-token, or, for a signed-in person, the one whose id is in x-order-id if it is theirs (My
// tickets' Manage link). The id is a header, as the token is, so neither lands in a log.
import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import type { Actor } from '#kit'
import type { OrderKey } from './reservations'

export function orderKeyOf(event: H3Event, actor: Actor): OrderKey {
  const token = getHeader(event, 'x-order-token')
  if (token) return { token }
  const orderId = getHeader(event, 'x-order-id')
  if (orderId) return { orderId, accountId: actor.kind === 'person' ? actor.accountId ?? null : null }
  return { token: '' }
}
