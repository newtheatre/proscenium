// Moves a booking to another time or room (SP-19, rules X2 and X3): at once when nothing needs a
// decision, otherwise as a request that replaces it, the booking keeping its time until then.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { actingOn, moveOrAsk } from '../../../../changes'
import { moveInput } from '../../../../inputs'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: moveInput }, async (event, { actor, input, unit }) => {
  const acting = await actingOn(actor, getRouterParam(event, 'id')!)
  const made = await moveOrAsk(unit.view(), acting, actor, { ...input, overrideReason: input.overrideReason ?? null })
  if (!acting.own) unit.view().audit({ action: 'update', record: ['spaces.booking', acting.booking.id], ability: 'spaces.booking.manage', detail: { moved: true } })
  return { bookingId: made.bookingId, state: made.state }
})
