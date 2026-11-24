// Which booking a request to the order link routes opens: the one whose link token is in
// x-order-token, or, for a signed-in person, the one whose id is in x-order-id if it is theirs (My
// tickets' Manage link). The id is a header, as the token is, so neither lands in a log.
import { getRequestHeader, type RequestEvent } from 'nuxt/server'
import type { Actor } from '#kit'
import type { OrderKey } from './reservations'

export function orderKeyOf(event: RequestEvent, actor: Actor): OrderKey {
  const token = getRequestHeader(event, 'x-order-token')
  if (token) return { token }
  const orderId = getRequestHeader(event, 'x-order-id')
  if (orderId) return { orderId, accountId: actor.kind === 'person' ? actor.accountId ?? null : null }
  return { token: '' }
}
