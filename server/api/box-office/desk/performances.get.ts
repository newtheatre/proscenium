import { z } from 'zod'
import { addDays } from '#shared/utils/series'
import { currentShowNight, isShowNight } from '#shared/utils/show-night'

const query = z.object({ night: z.string().refine(isShowNight, 'Not a valid night').optional() })

// Today's performance(s), with the adjacent nights to browse to either side (criterion 1).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const { night } = await getValidatedQueryOrThrow(event, query)
  const on = night ?? currentShowNight()

  return {
    night: on,
    previousNight: addDays(on, -1),
    nextNight: addDays(on, 1),
    performances: await performancesForNight(on),
  }
})
