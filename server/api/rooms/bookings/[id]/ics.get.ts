import { calendarFor } from '#shared/utils/ics'

// One booking, as a calendar file.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const id = getRouterParam(event, 'id') ?? ''

  const booking = await bookingFor(id)
  // The same answer for a booking that is not yours and one that is not there.
  if (!booking || booking.userId !== account.id) {
    throw createError({ statusCode: 404, statusMessage: 'That is not your booking' })
  }

  setHeader(event, 'content-type', 'text/calendar; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="booking-${id}.ics"`)

  return calendarFor([{
    id: booking.id,
    title: booking.title,
    room: booking.room,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
    updatedAt: booking.updatedAt,
  }], {
    name: booking.title,
    host: new URL(useRuntimeConfig(event).public.baseURL).hostname,
  })
})
