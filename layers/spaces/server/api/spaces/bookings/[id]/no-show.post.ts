// Sets or clears the no-show mark on a booking that has happened (SP-35, rule X6).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { setNoShow } from '../../../../changes'
import { requireBooking } from '../../../../bookings'
import { noShowInput } from '../../../../inputs'

export default defineRoute({ ability: 'spaces.booking.manage', record: event => ['spaces.booking', getRouterParam(event, 'id')!], rateLimit: 'write', idempotent: true, input: noShowInput }, async (event, { actor, input, unit }) => {
  const booking = await requireBooking(getRouterParam(event, 'id')!)
  setNoShow(unit.view(), booking, actor.accountId!, input.noShow)
  return { bookingId: booking.id, noShow: input.noShow }
})
