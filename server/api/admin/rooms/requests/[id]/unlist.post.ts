import { sql } from 'drizzle-orm'
import { refusalToUnlist } from '#shared/utils/bookings'
import { addWorkingDays, coversThrough, londonDate } from '#shared/utils/working-days'
import { unlistForm } from '#shared/utils/approvals'
import { formatLondon } from '#shared/utils/london'

// Move a request to a room we do not manage, freeing the slot it was holding.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, unlistForm)

  const booking = await bookingFor(id)
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'No such request' })

  const refusal = refusalToUnlist(booking)
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  // Refused rather than accepted and left undeliverable: converting on the day is the moment the
  // member most needs telling that it cannot work (C-123 criterion 2).
  const holidays = await configValue(event, 'BANK_HOLIDAYS')
  const startsAt = new Date(booking.startsAt * 1000)
  const notice = await configValue(event, 'EXTERNAL_REQUEST_NOTICE_WORKING_DAYS')

  if (!coversThrough(holidays, startsAt)) {
    throw createError({ statusCode: 409, statusMessage: 'Bank holidays are not known that far ahead, so the notice cannot be counted' })
  }
  const dueBy = londonDate(addWorkingDays(startsAt, -notice, holidays))
  if (dueBy < londonDate(new Date())) {
    throw createError({
      statusCode: 409,
      statusMessage: `There is no longer time to ask: the form would have had to go in by ${dueBy}`,
    })
  }

  const requestId = newId()
  const now = Math.floor(Date.now() / 1000)

  // The reason does not cross: it answers why a member is asking for something outside our
  // policy, which is not a question the other side asks (C-123 criterion 6).
  const insert = sql`
    INSERT INTO external_requests (id, user_id, title, purpose, attendees, starts_at, ends_at, notes, status, converted_from_booking_id)
    VALUES (${requestId}, ${booking.userId}, ${booking.title}, ${booking.purpose ?? UNRECORDED_PURPOSE},
            ${booking.attendees}, ${booking.startsAt}, ${booking.endsAt}, ${booking.notes}, 'REQUESTED', ${id})
  `

  const move = sql`
    UPDATE room_bookings SET status = 'CANCELLED', converted_to_request_id = ${requestId}, updated_at = ${now}
    WHERE id = ${id} AND status = 'PENDING_APPROVAL'
  `

  // Reached only when somebody decided the request between the read and the write: the duplicate
  // primary key fails the batch rather than leaving a request nothing points at (0035).
  const assertion = sql`
    INSERT INTO external_requests (id, user_id, title, purpose, starts_at, ends_at)
    SELECT ${requestId}, ${booking.userId}, ${booking.title}, ${booking.purpose ?? UNRECORDED_PURPOSE},
           ${booking.startsAt}, ${booking.endsAt}
    WHERE NOT EXISTS (
      SELECT 1 FROM room_bookings WHERE id = ${id} AND converted_to_request_id = ${requestId}
    )
  `

  try {
    await db.batch([db.run(insert), db.run(move), db.run(assertion)])
  }
  catch {
    throw createError({ statusCode: 409, statusMessage: 'That request has already been decided' })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'room.request.unlisted',
    target: `booking:${id}`,
    detail: { became: requestId, room: booking.roomId },
  }))

  await notify(event, {
    type: 'room.request.unlisted',
    userId: booking.userId,
    context: {
      name: booking.requester,
      title: booking.title,
      room: booking.room,
      when: formatLondon(new Date(booking.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      dueBy,
      why: input.reason,
      roomsUrl: `${useRuntimeConfig(event).public.baseURL}/rooms/mine`,
    },
  })

  return { ok: true, id, became: requestId, dueBy }
})
