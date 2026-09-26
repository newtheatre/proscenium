import type { EarlierTillLeftOpen } from '#shared/utils/till'

// What ended nights left open at any bar: tills to close and card charges to answer. No shift
// reaches back into a night, so only the Bar Manager's role reads this (F-102 criterion 5).
export default defineEventHandler(async (event): Promise<EarlierTillLeftOpen> => {
  await barOfficerFor(event, 'What an earlier night left open', 'see')
  const tonight = currentShowNight()
  const [sessions, attempts] = await Promise.all([earlierOpenSessions(tonight), earlierUnresolvedAttempts(tonight)])
  return { sessions, attempts }
})
