import { earliestAskDay } from '#shared/utils/external-requests'

// The estate booking numbers, so a screen mirrors the rules rather than restating them.
export default defineEventHandler(async (event) => {
  await requireAccount(event)
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
  }
})
