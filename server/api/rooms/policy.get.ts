import { earliestAskDay } from '#shared/utils/external-requests'
import { resolvePolicy } from '#shared/utils/booking-policy'

// The estate booking numbers, so a screen mirrors the rules rather than restating them.
export default defineEventHandler(async (event) => {
  const { account, permissions } = await authority(event)
  const estate = await estatePolicy(event)

  // The first day a room we do not manage can be asked for, said before the form (issue 1338).
  const externalEarliestDay = earliestAskDay(
    new Date(),
    await configValue(event, 'EXTERNAL_REQUEST_NOTICE_WORKING_DAYS'),
    await configValue(event, 'BANK_HOLIDAYS'),
  )

  return {
    ...estate,
    seriesCap: await configValue(event, 'ROOM_SERIES_MAX_OCCURRENCES'),
    purposes: await configValue(event, 'ROOM_PURPOSES'),
    externalEarliestDay,
    // What the booking form says before anything is typed: each room's own numbers, the reader's
    // count against the cap, and whether the longest rule binds them.
    byRoom: Object.fromEntries((await listRooms(false)).map(room => [room.id, resolvePolicy(room, estate)])),
    held: await activeBookingsFor(account.id, Math.floor(Date.now() / 1000)),
    exemptFromLongest: permissions.has('rooms.write') && estate.maxBookingAdminsExempt,
  }
})
