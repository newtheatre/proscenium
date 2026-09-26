import { earliestAskDay } from '#shared/utils/external-requests'
import { coversThrough } from '#shared/utils/working-days'

// The estate booking numbers, so a screen mirrors the rules rather than restating them.
export default defineEventHandler(async (event) => {
  await requireAccount(event)
  const estate = await estatePolicy(event)

  // The first day a room we do not manage can be asked for, said before the form (issue 1338);
  // null when the bank holidays do not reach it, which the request itself then refuses.
  const now = new Date()
  const holidays = await configValue(event, 'BANK_HOLIDAYS')
  const earliest = earliestAskDay(now, await configValue(event, 'EXTERNAL_REQUEST_NOTICE_WORKING_DAYS'), holidays)
  const externalEarliestDay = coversThrough(holidays, new Date(`${earliest}T12:00:00Z`)) ? earliest : null

  return {
    ...estate,
    seriesCap: await configValue(event, 'ROOM_SERIES_MAX_OCCURRENCES'),
    purposes: await configValue(event, 'ROOM_PURPOSES'),
    externalEarliestDay,
  }
})
